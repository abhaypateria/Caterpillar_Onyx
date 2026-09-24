import { useTranslation } from 'react-i18next';
import { pauseSpeaking, resumeSpeaking, stopSpeaking, useSpeechState } from '../voice';

/** Floating Pause/Resume + Stop for anything Onyx is saying. Hidden when silent. */
export default function SpeechControls() {
  const { t } = useTranslation();
  const state = useSpeechState();
  if (state === 'idle') return null;
  return (
    <div className="speechctl" role="group" aria-label={t('speech.controls')}>
      {state === 'paused'
        ? <button onClick={resumeSpeaking}>▶ {t('speech.resume')}</button>
        : <button className="ghost" onClick={pauseSpeaking}>⏸ {t('speech.pause')}</button>}
      <button className="ghost" onClick={stopSpeaking}>⏹ {t('speech.stop')}</button>
    </div>
  );
}
