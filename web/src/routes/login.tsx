import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { ChevronDown, Globe2 } from 'lucide-react'
import { authenticateWithEmail } from '@/lib/api'

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>) => ({
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: LoginScreen,
})

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
]

function UiLanguageSelect() {
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

function LoginScreen() {
  const { t } = useTranslation()
  const { error } = useSearch({ from: '/login' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const result = await authenticateWithEmail({ mode, name, email, password })
      queryClient.setQueryData(['auth-me'], result.user)
      navigate({ to: result.needsOnboarding ? '/onboarding' : '/' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'auth_failed')
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = formError ?? error

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6 py-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-lt-primary flex items-center justify-center shadow-lg">
            <span className="text-4xl">🌐</span>
          </div>
          <div className="text-center">
            <h1 className="text-lt-text text-3xl font-bold tracking-tight">HelloVia Translate</h1>
            <p className="text-lt-muted text-sm mt-1">{t('home.tagline')}</p>
          </div>
          <UiLanguageSelect />
        </div>

        {/* Card */}
        <div className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-lt-text text-xl font-semibold">{t('login.title')}</h2>
            <p className="text-lt-muted text-sm mt-1">{t('login.subtitle')}</p>
          </div>

          {displayError && (
            <div className="bg-lt-danger/10 border border-lt-danger rounded-xl px-4 py-3 text-center">
              <p className="text-lt-danger text-sm">
                {t(`login.error.${displayError}`, t('login.error.oauth_failed'))}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 rounded-xl border border-lt-border bg-lt-bg p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setFormError(null) }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-lt-primary text-lt-text' : 'text-lt-muted hover:text-lt-text'}`}
            >
              {t('login.emailSignIn')}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/signup' })}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-lt-muted transition-colors hover:text-lt-text"
            >
              {t('login.createAccount')}
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
            {mode === 'signup' && (
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('login.namePlaceholder')}
                autoComplete="name"
                className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
              />
            )}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('login.emailPlaceholder')}
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
            />
            <div className="relative">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 8 : undefined}
                required
                className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 pr-11 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword', 'Hide password') : t('login.showPassword', 'Show password')}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-lt-muted hover:text-lt-primary transition-colors"
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            <div className="flex justify-end -mt-1">
              <Link to="/forgot-password" className="text-lt-primary text-xs font-medium hover:underline">
                {t('login.forgotPassword')}
              </Link>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-lt-primary px-4 py-3.5 font-semibold text-lt-text transition-colors hover:bg-lt-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? t('common.loading')
                : mode === 'signup'
                  ? t('login.createAccount')
                  : t('login.emailSignIn')}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-lt-border" />
            <span className="text-xs text-lt-muted">{t('login.or')}</span>
            <div className="h-px flex-1 bg-lt-border" />
          </div>

          <button
            onClick={() => { window.location.href = '/auth/google' }}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800 font-semibold rounded-xl py-3.5 px-4 transition-colors shadow-sm border border-gray-200"
          >
            <GoogleIcon />
            <span>{t('login.continueWithGoogle')}</span>
          </button>

          <p className="text-lt-muted text-xs text-center leading-relaxed">
            {t('login.terms')}
          </p>
        </div>

      </div>
    </div>
  )
}
