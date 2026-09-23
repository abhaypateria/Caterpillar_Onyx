import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { listen, parseIntent, speak } from '../voice';

/**
 * Push-to-talk button. Owner: Person B.
 * TODO(B): route each intent to its action (next task, done with confirm, incident, lesson, summary, mayday).
 */
export default function VoiceButton() {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState('');

  async function go() {
    setOn(true); setHeard(t('voice.listening'));
    try {
      const text = await listen(lang);
      const intent = parseIntent(text);
      setHeard(`“${text}” → ${intent.name}`);
      if (intent.name === 'unknown') speak(t('voice.didntCatch'), lang);
    } catch {
      setHeard(t('voice.didntCatch'));
    } finally { setOn(false); }
  }

  return (
    <>
      {heard && <div className="voicetext card">{heard}</div>}
      <button className={`voicebtn ${on ? 'on' : ''}`} onClick={go} aria-label={t('voice.tap')}>🎙</button>
    </>
  );
}
