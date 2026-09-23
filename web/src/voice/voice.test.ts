import { describe, expect, it } from 'vitest';
import { parseIntent } from '.';

// Offline keyword matcher: what the operator can say with no network.
const CASES: [string, string][] = [
  // English (README examples)
  ['What is my next task?', 'next_task'],
  ['Mark excavation complete', 'task_done'],
  ['Why is this task taking longer?', 'why_late'],
  ['There was a person near the machine', 'report_incident'],
  ['Start my recommended lesson', 'start_lesson'],
  ['How was my shift?', 'shift_summary'],
  ['How long will this take?', 'eta'],
  ['ETA kya hai?', 'eta'],
  ['haan, confirm', 'confirm'],
  // Hindi code-mix (demo script)
  ['Agla kaam kya hai?', 'next_task'],
  ['Machine ko kitna time lagega?', 'eta'],
  ['Kaam ho gaya', 'task_done'],
  ['Near miss log karo, ek aadmi machine ke peeche aa gaya', 'report_incident'],
  ['bachao bachao', 'mayday'],
  ['haan', 'confirm'],
  ['nahi', 'cancel'],
  ['Aaj shift kaisa raha?', 'shift_summary'],
  // Tamil
  ['அடுத்த வேலை என்ன?', 'next_task'],
  ['ஏன் தாமதம்?', 'why_late'],
  ['ஆம்', 'confirm'],
  ['வேண்டாம்', 'cancel'],
  // Kannada
  ['ಮುಂದಿನ ಕೆಲಸ ಏನು?', 'next_task'],
  ['ಯಾಕೆ ತಡ?', 'why_late'],
  ['ಹೌದು', 'confirm'],
  ['ಬೇಡ', 'cancel'],
  // Must not trigger a command
  ['Show me the details of the metal bucket', 'unknown'],
];

describe('parseIntent', () => {
  it.each(CASES)('%s → %s', (text, expected) => {
    expect(parseIntent(text).name).toBe(expected);
  });

  it('keeps the full transcript for incident reports', () => {
    const i = parseIntent('Near miss log karo, ek aadmi peeche aa gaya');
    expect(i).toEqual({ name: 'report_incident', text: 'Near miss log karo, ek aadmi peeche aa gaya' });
  });
});
