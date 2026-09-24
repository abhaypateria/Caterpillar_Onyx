import { useSyncExternalStore } from 'react';
import type { Lang, Priority } from '../types';
import { SPEECH_LOCALE } from '../i18n';
import { recordUtterance, sarvamAvailable, sarvamTts } from './sarvam';
import { api } from '../api/client';

/**
 * Voice layer contract. Owner: Person B.
 * Screens only call `speak()`, `listen()` and `parseIntent()`; providers can change underneath.
 * Order of providers: Sarvam (via /api/speech) → browser Web Speech → offline keywords.
 */

// ----- Speaking (priority queue: critical interrupts, warning waits, info only when idle) -----
const queue: { text: string; lang: Lang; priority: Priority }[] = [];
let speaking = false;
let paused = false;
let current: string | null = null;
let playing: HTMLAudioElement | null = null;
// Bumped on stop: callbacks from an older generation (ended utterances, late Sarvam audio) are ignored.
let gen = 0;

export type SpeechState = 'idle' | 'speaking' | 'paused';
const listeners = new Set<() => void>();
let state: SpeechState = 'idle';
function emit() {
  const next: SpeechState = paused ? 'paused' : speaking || queue.length ? 'speaking' : 'idle';
  if (next !== state) { state = next; listeners.forEach((f) => f()); }
}
export const getSpeechState = () => state;
export function onSpeechState(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
/** React hook: current speech state, for Play/Pause/Stop buttons. */
export const useSpeechState = () => useSyncExternalStore(onSpeechState, getSpeechState);

const supported = () => 'speechSynthesis' in window || typeof Audio !== 'undefined';

/**
 * Queue a message. The same text is never queued twice (already playing or waiting),
 * so repeated triggers don't make the assistant say it again and again.
 */
export function speak(text: string, lang: Lang, priority: Priority = 'info') {
  if (!supported() || !text.trim()) return;
  if (priority === 'critical') stopSpeaking();
  else if (text === current || queue.some((q) => q.text === text)) return;
  queue.push({ text, lang, priority });
  queue.sort((a, b) => rank(a.priority) - rank(b.priority));
  emit();
  drain();
}
const rank = (p: Priority) => (p === 'critical' ? 0 : p === 'warning' ? 1 : 2);

/** Play these parts from the start, replacing anything that was playing (e.g. a lesson's Play button). */
export function speakSequence(parts: string[], lang: Lang) {
  if (!supported()) return;
  stopSpeaking();
  for (const text of parts) if (text.trim()) queue.push({ text, lang, priority: 'info' });
  emit();
  drain();
}

/** Stop now and forget everything queued. */
export function stopSpeaking() {
  gen++;
  queue.length = 0;
  window.speechSynthesis?.cancel();
  playing?.pause(); playing = null;
  speaking = false; paused = false; current = null;
  emit();
}

/** Pause mid-sentence; resumeSpeaking() continues from the same point. */
export function pauseSpeaking() {
  if (!speaking || paused) return;
  paused = true;
  if (playing) playing.pause(); else window.speechSynthesis?.pause();
  emit();
}
export function resumeSpeaking() {
  if (!paused) return;
  paused = false;
  if (playing) playing.play().catch(() => undefined); else window.speechSynthesis?.resume();
  emit();
  if (!speaking) drain();
}

/** A device voice for this language, if any (Windows often has none for ta/kn). */
function deviceVoice(lang: Lang) {
  const want = SPEECH_LOCALE[lang].toLowerCase();
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want)
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2)));
}

/** Device voice when available (instant); otherwise Sarvam audio; otherwise best-effort device speech. */
async function drain() {
  if (speaking || paused || !queue.length) return;
  const next = queue.shift()!;
  const g = gen;
  speaking = true; current = next.text;
  emit();
  const done = () => {
    if (g !== gen) return; // stopped meanwhile
    speaking = false; playing = null; current = null;
    emit();
    drain();
  };
  const voice = deviceVoice(next.lang);
  if (!voice && (await sarvamAvailable())) {
    const url = await sarvamTts(next.text, next.lang);
    if (g !== gen) return;
    if (url) {
      const a = new Audio(url);
      playing = a;
      a.onended = a.onerror = done;
      if (!paused) a.play().catch(done);
      return;
    }
  }
  if (!('speechSynthesis' in window)) return done();
  const u = new SpeechSynthesisUtterance(next.text);
  u.lang = SPEECH_LOCALE[next.lang];
  if (voice) u.voice = voice;
  u.onend = u.onerror = done;
  window.speechSynthesis.speak(u);
}

// ----- Listening -----
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: (e: unknown) => void; onend: () => void; start: () => void };

/**
 * Listen for one utterance. Sarvam first (best for Indian languages and code-mixed speech),
 * then the browser's recognition (Chrome, online). Rejects if neither is available.
 */
export async function listen(lang: Lang): Promise<string> {
  if (await sarvamAvailable()) {
    const audio = await recordUtterance().catch(() => null);
    if (!audio) return '';
    const r = await api.transcribe(audio, lang);
    if (r) return r.text;
    // Sarvam failed mid-request: fall through and let the browser try a fresh listen.
  }
  return browserListen(lang);
}

function browserListen(lang: Lang): Promise<string> {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new Error('speech-recognition-unavailable'));
  return new Promise((resolve, reject) => {
    const r = new Ctor();
    r.lang = SPEECH_LOCALE[lang];
    r.interimResults = false;
    let got = '';
    r.onresult = (e) => { got = e.results[0][0].transcript; };
    r.onerror = (e) => reject(e);
    r.onend = () => resolve(got);
    r.start();
  });
}

// ----- Intents -----
export type Intent =
  | { name: 'next_task' } | { name: 'task_done' } | { name: 'eta' } | { name: 'why_late' }
  | { name: 'report_incident'; text: string } | { name: 'start_lesson' } | { name: 'shift_summary' }
  | { name: 'mayday' } | { name: 'confirm' } | { name: 'cancel' } | { name: 'unknown'; text: string };

/**
 * Offline keyword matcher for mixed-language speech. TODO(B): extend keywords for ta/kn,
 * and fall back to api.intent() (LLM) when this returns `unknown` and we're online.
 */
// `\b` only understands Latin letters, so Tamil/Kannada words end at whitespace/punctuation/end instead.
const END = String.raw`(?=$|[\s,.!?।])`;
const KEYWORDS: [Intent['name'], RegExp][] = [
  ['mayday', /बचाओ|मदद|mayday|help help|bachao|காப்பாற்று|ಸಹಾಯ/i],
  ['confirm', new RegExp(`^(हाँ|हां|ठीक है|confirm|yes|haan|ha|ok|ஆம்|ಹೌದು)${END}`, 'i')],
  ['cancel', new RegExp(`^(नहीं|रद्द|cancel|no|nahi|nahin|வேண்டாம்|ಬೇಡ)${END}`, 'i')],
  ['next_task', /अगला काम|next task|agla kaam|next.*kya|அடுத்த|ಮುಂದಿನ/i],
  ['task_done', /हो गया|खत्म|ख़त्म|पूरा हो|(mark|task|kaam).*(done|complete|ho gaya|khatam)|முடிந்தது|ಮುಗಿದಿದೆ/i],
  ['why_late', /क्यों|why|kyun|kyon|ஏன்|ಯಾಕೆ/i],
  ['eta', /कितना समय|कितना टाइम|कितनी देर|कब तक|\beta\b|kitna time|how long|kab tak|எவ்வளவு நேரம்|ಎಷ್ಟು ಸಮಯ/i],
  ['start_lesson', /सीख|ट्रेनिंग|पाठ|lesson|training|sikh|பாடம்|ಪಾಠ/i],
  ['shift_summary', /शिफ्ट|कैसा रहा|shift|summary|kaisa raha|சுருக்கம்|ಸಾರಾಂಶ/i],
  ['report_incident', /घटना|रिपोर्ट|दुर्घटना|(आदमी|कोई).*(पीछे|पास)|incident|near miss|log karo|report|accident|(person|someone|worker|aadmi).*(near|behind|close|peeche|paas)|விபத்து|ಅಪಘಾತ/i],
];

export function parseIntent(text: string): Intent {
  for (const [name, re] of KEYWORDS) {
    if (re.test(text)) return name === 'report_incident' ? { name, text } : ({ name } as Intent);
  }
  return { name: 'unknown', text };
}
