import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal fake of the browser speech engine: records what was spoken and lets tests finish utterances.
type Utt = { text: string; lang?: string; voice?: unknown; onend?: () => void; onerror?: () => void };
const spoken: Utt[] = [];
const synth = {
  speaking: null as Utt | null,
  pausedFlag: false,
  speak(u: Utt) { spoken.push(u); this.speaking = u; },
  cancel() { this.speaking = null; },
  pause() { this.pausedFlag = true; },
  resume() { this.pausedFlag = false; },
  getVoices: () => [{ lang: 'en-IN' }],
};
const finish = () => { const u = synth.speaking; synth.speaking = null; u?.onend?.(); };
const flush = () => new Promise((r) => setTimeout(r, 0));

vi.stubGlobal('window', { speechSynthesis: synth });
vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(t: string) { this.text = t; } });
vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) })); // no Sarvam in tests

const v = await import('./index');

describe('speech queue', () => {
  beforeEach(() => { v.stopSpeaking(); spoken.length = 0; synth.pausedFlag = false; });

  it('does not queue the same message twice (no endless repeats)', async () => {
    v.speak('Fasten your seatbelt.', 'en', 'warning');
    v.speak('Fasten your seatbelt.', 'en', 'warning');
    v.speak('Fasten your seatbelt.', 'en', 'warning');
    await flush(); finish(); await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Fasten your seatbelt.']);
    expect(v.getSpeechState()).toBe('idle');
  });

  it('Play restarts from the beginning instead of queueing a second copy', async () => {
    v.speakSequence(['Title', 'Step 1', 'Step 2'], 'en');
    await flush(); finish(); await flush(); // now on "Step 1"
    v.speakSequence(['Title', 'Step 1', 'Step 2'], 'en'); // pressed Play again
    await flush();
    for (let i = 0; i < 3; i++) { finish(); await flush(); }
    expect(spoken.map((u) => u.text)).toEqual(['Title', 'Step 1', 'Title', 'Step 1', 'Step 2']);
    expect(v.getSpeechState()).toBe('idle');
  });

  it('Pause holds the current sentence and Resume continues it', async () => {
    v.speakSequence(['Title', 'Step 1'], 'en');
    await flush();
    v.pauseSpeaking();
    expect(v.getSpeechState()).toBe('paused');
    expect(synth.pausedFlag).toBe(true);
    v.resumeSpeaking();
    expect(synth.pausedFlag).toBe(false);
    expect(v.getSpeechState()).toBe('speaking');
    finish(); await flush(); finish(); await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Title', 'Step 1']);
  });

  it('Stop clears everything queued', async () => {
    v.speakSequence(['A', 'B', 'C'], 'en');
    await flush();
    v.stopSpeaking();
    finish(); await flush(); // a late "ended" from the cancelled sentence must not start B
    expect(spoken.map((u) => u.text)).toEqual(['A']);
    expect(v.getSpeechState()).toBe('idle');
  });

  it('critical alerts interrupt whatever is playing', async () => {
    v.speakSequence(['Long lesson sentence'], 'en');
    await flush();
    v.speak('STOP. Person behind.', 'en', 'critical');
    await flush();
    expect(spoken.at(-1)?.text).toBe('STOP. Person behind.');
  });
});
