import type { Incident, IncidentType, Lang, Severity } from '../types';

/**
 * Typed client for the FastAPI backend (api/). Contract is documented in docs/API.md.
 * Every call may fail (offline, no key): callers must handle `null` and use a local fallback.
 */
const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

export const api = {
  health: async () => { try { return (await fetch(BASE + '/health')).ok; } catch { return false; } },

  /** Voice text → structured incident (LLM, keyword fallback). */
  structureIncident: (text: string, lang: Lang) =>
    post<{ type: IncidentType; severity: Severity; description: string }>('/llm/incident', { text, lang }),

  /** Free-form speech → intent name when the keyword matcher fails. */
  intent: (text: string, lang: Lang) => post<{ name: string; text?: string }>('/llm/intent', { text, lang }),

  /** Facts → short spoken summary in the operator's language. */
  summary: (facts: Record<string, unknown>, lang: Lang, audience: 'operator' | 'owner' | 'supervisor') =>
    post<{ text: string }>('/llm/summary', { facts, lang, audience }),

  /** Incident → short scenario lesson (near-miss → lesson loop). */
  lessonFromIncident: (incident: Incident, lang: Lang) =>
    post<{ title: string; steps: string[]; quiz: { q: string; options: string[]; answer: number }[] }>('/llm/lesson', { incident, lang }),

  /** Sarvam speech-to-text. audio = base64 WAV/WEBM. */
  transcribe: (audioBase64: string, lang: Lang) => post<{ text: string }>('/speech/stt', { audio: audioBase64, lang }),

  /** Sarvam text-to-speech. Returns base64 audio. */
  tts: (text: string, lang: Lang) => post<{ audio: string }>('/speech/tts', { text, lang }),

  /** Sync locally logged incidents. Returns ids saved. */
  syncIncidents: (incidents: Incident[]) => post<{ saved: string[] }>('/incidents', { incidents }),
};

/** Open-Meteo is called directly (free, no key, CORS-enabled). */
export async function fetchWeather(lat = 12.97, lon = 77.59) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day`;
    const j = await (await fetch(u)).json();
    return j.current as { temperature_2m: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number };
  } catch { return null; }
}

/** WhatsApp click-to-chat fallback (no API needed). */
export const whatsappLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
