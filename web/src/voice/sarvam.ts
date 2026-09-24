import type { Lang } from '../types';
import { api } from '../api/client';

/**
 * Sarvam speech via our API (/api/speech/*). Keys stay on the server.
 * - TTS: used when the device has no voice for the language (common for Tamil/Kannada on Windows).
 * - STT: records the mic until the operator pauses, sends 16 kHz mono WAV, returns the transcript.
 * Every function fails soft (returns null) so callers fall back to the browser engines.
 */

let availability: Promise<boolean> | null = null;
/** Is Sarvam configured on the server? Checked once per session. */
export function sarvamAvailable(): Promise<boolean> {
  availability ??= fetch('/api/health')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => Boolean(j?.sarvam))
    .catch(() => false);
  return availability;
}

// ---------------------------------------------------------------- TTS
const ttsCache = new Map<string, Promise<string | null>>();

/** Returns a playable data URL for the text, or null. Cached, so repeated alerts play instantly. */
export function sarvamTts(text: string, lang: Lang): Promise<string | null> {
  const key = `${lang}|${text}`;
  if (!ttsCache.has(key)) {
    const p = api.tts(text, lang).then((r) => (r?.audio ? `data:audio/wav;base64,${r.audio}` : null));
    // Don't cache failures, so a later retry can succeed.
    p.then((v) => { if (!v) ttsCache.delete(key); });
    ttsCache.set(key, p);
  }
  return ttsCache.get(key)!;
}

// ---------------------------------------------------------------- STT
const TARGET_RATE = 16000;

/** Record until ~1.2 s of silence after speech (or 8 s max), return base64 WAV. */
/**
 * Record from the mic until the operator presses the button again (`control.stop = true`), or maxMs as a safety cap.
 * No automatic stop on silence: the operator decides. The mic is opened per recording and fully released after.
 * onStart fires once audio is actually being captured, so the UI shows "Listening…" only when it is safe to speak.
 */
export async function recordUtterance(opts = { maxMs: 30000 }, control: { stop: boolean } = { stop: false }, onStart?: () => void): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
    rec.start(250);
    onStart?.();

    // Simple voice-activity detection on RMS level.
    const buf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let heard = false;
    await new Promise<void>((done) => {
      const id = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
        const now = performance.now();
        if (rms > 0.015) heard = true;
        const elapsed = now - t0;
        if (control.stop || elapsed > opts.maxMs) {
          clearInterval(id); done();
        }
      }, 100);
    });
    rec.stop();
    await stopped;
    if (!heard || !chunks.length) return null;
    const decoded = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
    return toWavBase64(await resampleMono(decoded));
  } finally {
    stream.getTracks().forEach((t) => t.stop()); // mic fully off when not recording
    ctx.close();
  }
}

async function resampleMono(b: AudioBuffer): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.ceil(b.duration * TARGET_RATE), TARGET_RATE);
  const src = off.createBufferSource();
  src.buffer = b;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** 16-bit PCM WAV, base64-encoded. */
export function toWavBase64(samples: Float32Array, rate = TARGET_RATE): string {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  const bytes = new Uint8Array(view.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
