import type { Lang, Priority } from '../types';
import { SPEECH_LOCALE } from '../i18n';

/**
 * Voice layer contract. Owner: Person B.
 * Screens only call `speak()`, `listen()` and `parseIntent()`; providers can change underneath.
 * Order of providers: Sarvam (via /api/speech) → browser Web Speech → offline keywords.
 */

// ----- Speaking (priority queue: critical interrupts, warning waits, info only when idle) -----
const queue: { text: string; lang: Lang; priority: Priority }[] = [];
let speaking = false;

export function speak(text: string, lang: Lang, priority: Priority = 'info') {
  if (!('speechSynthesis' in window)) return;
  if (priority === 'critical') { window.speechSynthesis.cancel(); queue.length = 0; speaking = false; }
  queue.push({ text, lang, priority });
  queue.sort((a, b) => rank(a.priority) - rank(b.priority));
  drain();
}
const rank = (p: Priority) => (p === 'critical' ? 0 : p === 'warning' ? 1 : 2);

function drain() {
  if (speaking || !queue.length) return;
  const next = queue.shift()!;
  const u = new SpeechSynthesisUtterance(next.text);
  u.lang = SPEECH_LOCALE[next.lang];
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang);
  if (voice) u.voice = voice;
  speaking = true;
  u.onend = u.onerror = () => { speaking = false; drain(); };
  window.speechSynthesis.speak(u);
}

// ----- Listening -----
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: (e: unknown) => void; onend: () => void; start: () => void };

/** Browser speech recognition (online, Google servers in Chrome). TODO(B): try Sarvam first via api.transcribe(). */
export function listen(lang: Lang): Promise<string> {
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
 * and fall back to api.intent() (Gemini) when this returns `unknown` and we're online.
 */
const KEYWORDS: [Intent['name'], RegExp][] = [
  ['mayday', /mayday|help help|bachao|காப்பாற்று|ಸಹಾಯ/i],
  ['confirm', /^(confirm|yes|haan|ha|ok|ஆம்|ಹೌದು)\b/i],
  ['cancel', /^(cancel|no|nahi|nahin|வேண்டாம்|ಬೇಡ)\b/i],
  ['next_task', /next task|agla kaam|next.*kya|அடுத்த|ಮುಂದಿನ/i],
  ['task_done', /(mark|task|kaam).*(done|complete|ho gaya|khatam)|முடிந்தது|ಮುಗಿದಿದೆ/i],
  ['why_late', /why|kyun|kyon|ஏன்|ಯಾಕೆ/i],
  ['eta', /eta|kitna time|how long|kab tak|எவ்வளவு நேரம்|ಎಷ್ಟು ಸಮಯ/i],
  ['start_lesson', /lesson|training|sikh|பாடம்|ಪಾಠ/i],
  ['shift_summary', /shift|summary|kaisa raha|சுருக்கம்|ಸಾರಾಂಶ/i],
  ['report_incident', /incident|near miss|log karo|report|accident|விபத்து|ಅಪಘಾತ/i],
];

export function parseIntent(text: string): Intent {
  for (const [name, re] of KEYWORDS) {
    if (re.test(text)) return name === 'report_incident' ? { name, text } : ({ name } as Intent);
  }
  return { name: 'unknown', text };
}
