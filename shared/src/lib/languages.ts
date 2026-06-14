export interface Language {
  code: string
  name: string
  nativeName: string
  flag: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English',    nativeName: 'English',    flag: '🇺🇸' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',    flag: '🇪🇸' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   flag: '🇫🇷' },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it', name: 'Italian',    nativeName: 'Italiano',   flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  flag: '🇧🇷' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',        flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese',   nativeName: '日本語',      flag: '🇯🇵' },
  { code: 'ko', name: 'Korean',     nativeName: '한국어',      flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',    flag: '🇸🇦' },
  { code: 'ru', name: 'Russian',    nativeName: 'Русский',    flag: '🇷🇺' },
  { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी',     flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish',    nativeName: 'Türkçe',     flag: '🇹🇷' },
  { code: 'nl', name: 'Dutch',      nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish',     nativeName: 'Polski',     flag: '🇵🇱' },
  { code: 'sv', name: 'Swedish',    nativeName: 'Svenska',    flag: '🇸🇪' },
  { code: 'cs', name: 'Czech',      nativeName: 'Čeština',    flag: '🇨🇿' },
  { code: 'fi', name: 'Finnish',    nativeName: 'Suomi',      flag: '🇫🇮' },
  { code: 'hu', name: 'Hungarian',  nativeName: 'Magyar',     flag: '🇭🇺' },
  { code: 'ro', name: 'Romanian',   nativeName: 'Română',     flag: '🇷🇴' },
  { code: 'uk', name: 'Ukrainian',  nativeName: 'Українська', flag: '🇺🇦' },
]

export function getLang(code: string): Language {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}
