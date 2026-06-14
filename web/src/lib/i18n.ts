import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en, fr, es } from '@live-translate/shared/locales';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    detection: {
      order: ['cookie', 'navigator', 'localStorage'],
      lookupCookie: 'locale',
      caches: ['cookie'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
