import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import kn from './locales/kn.json';

// en.json is the source of truth for keys. Missing keys in other languages fall back to English.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, ta: { translation: ta }, kn: { translation: kn } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
});

/** BCP-47 tags for speech engines. */
export const SPEECH_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN' } as const;
export const LANG_LABEL = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', kn: 'ಕನ್ನಡ' } as const;

export default i18n;
