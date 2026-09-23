import i18n from '../../i18n';
import { useStore } from '../../store';
import { speak } from '../../voice';
import type { Priority } from '../../types';

/** Speak an i18n key in the operator's language through the priority queue. */
export function say(key: string, priority: Priority, params?: Record<string, string | number>) {
  const lang = useStore.getState().lang;
  speak(i18n.t(key, { ...params, lng: lang }), lang, priority);
}
