import { describe, expect, it } from 'vitest';
import { parseIntent } from './index';

// Sarvam returns Hindi in Devanagari; the offline matcher must understand it without the LLM.
describe('Devanagari intents (Sarvam hi-IN output)', () => {
  it.each([
    ['अगला काम क्या है?', 'next_task'],
    ['यह काम कितना समय लेगा?', 'eta'],
    ['देर क्यों हो रही है', 'why_late'],
    ['हाँ', 'confirm'],
    ['नहीं', 'cancel'],
    ['एक आदमी मशीन के पीछे आ गया', 'report_incident'],
    ['बचाओ', 'mayday'],
  ])('%s → %s', (text, name) => expect(parseIntent(text).name).toBe(name));
});
