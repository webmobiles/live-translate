import { useTranslation } from 'react-i18next'
import { ChevronDown, Globe2 } from 'lucide-react'

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
]

// App-language picker, shared by the login page and the home header.
export function UiLanguageSelect() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.resolvedLanguage?.split('-')[0] ?? 'en'

  return (
    <div className="relative inline-flex items-center rounded-full border border-lt-border bg-lt-card/90 text-lt-muted shadow-sm transition-colors focus-within:border-lt-primary hover:text-lt-text">
      <span className="pointer-events-none absolute left-3 flex items-center">
        <Globe2 size={18} aria-hidden="true" />
      </span>
      <select
        value={currentLang}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        aria-label={t('settings.uiLanguage')}
        className="h-10 cursor-pointer appearance-none rounded-full bg-transparent pl-9 pr-8 text-sm font-medium text-lt-text outline-none"
      >
        {UI_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>{language.name}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-lt-muted">
        <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" />
      </span>
    </div>
  )
}
