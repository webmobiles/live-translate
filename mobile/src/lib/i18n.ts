import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { en, fr, es, pt, de, it } from '@live-translate/shared/locales';

function deviceLocale(): string {
  const raw = Localization.getLocales()?.[0]?.languageCode ?? 'en';
  return raw.split('-')[0].toLowerCase();
}

const SUPPORTED = ['en', 'fr', 'es', 'pt', 'de', 'it'];

i18n
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
    lng: SUPPORTED.includes(deviceLocale()) ? deviceLocale() : 'en',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    interpolation: { escapeValue: false },
  });

export default i18n;
