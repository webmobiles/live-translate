import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';

i18n
  .use(LanguageDetector)   // reads navigator.language, then cookie 'i18next', then localStorage
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    // Strip region code: 'fr-FR' → 'fr'
    detection: {
      order: ['cookie', 'navigator', 'localStorage'],
      lookupCookie: 'locale',
      caches: ['cookie'],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
