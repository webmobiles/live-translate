import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en, fr, es, pt, de, it } from '@live-translate/shared/locales';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      pt: { translation: pt },
      de: { translation: de },
      it: { translation: it },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es', 'pt', 'de', 'it'],
    detection: {
      order: ['cookie', 'navigator', 'localStorage'],
      lookupCookie: 'locale',
      caches: ['cookie'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
