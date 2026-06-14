import { useEffect, type ChangeEvent } from 'react'
import { createRootRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchUser } from '@/lib/api'

export const Route = createRootRoute({
  component: RootLayout,
})

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/onboarding']

function RootLayout() {
  const navigate   = useNavigate()
  const { pathname } = useLocation()

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  fetchUser,
    retry:    false,
    staleTime: 60_000,
  })

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isLoading) return

    if (!user && !isPublic) {
      navigate({ to: '/login', search: { error: undefined } })
      return
    }

    // Logged in but profile not yet complete → onboarding
    if (user && (!user.nickname || !user.mother_language) && pathname !== '/onboarding') {
      navigate({ to: '/onboarding' })
    }

    // Already complete, redirect away from login/onboarding
    if (user && user.nickname && user.mother_language && isPublic) {
      navigate({ to: '/' })
    }
  }, [user, isLoading, isPublic, pathname, navigate])

  if (isLoading) {
    return (
      <>
        <UiLanguageSelect />
        <LoadingScreen />
      </>
    )
  }

  return (
    <>
      <UiLanguageSelect />
      <Outlet />
    </>
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
  const { i18n, t } = useTranslation()
  const currentLanguage = i18n.resolvedLanguage?.split('-')[0] ?? 'en'

  useEffect(() => {
    document.documentElement.lang = currentLanguage
  }, [currentLanguage])

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(event.target.value)
  }

  return (
    <div className="fixed left-3 top-3 z-50 sm:left-4 sm:top-4">
      <label htmlFor="ui-language" className="sr-only">
        {t('common.uiLanguage')}
      </label>
      <select
        id="ui-language"
        value={currentLanguage}
        onChange={handleChange}
        aria-label={t('common.uiLanguage')}
        className="h-9 max-w-[calc(100vw-1.5rem)] rounded-lg border border-lt-border bg-lt-card px-3 text-sm font-medium text-white shadow-lg shadow-black/20 outline-none transition-colors hover:border-lt-primary focus:border-lt-primary focus:ring-2 focus:ring-lt-primary/30"
      >
        {UI_LANGUAGES.map(language => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-4xl">🌐</span>
        <p className="text-lt-muted text-sm">{t('common.loading')}</p>
      </div>
    </div>
  )
}
