import { useEffect, useState } from 'react'
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

  const { data: user, isError, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  fetchUser,
    retry:    false,
    staleTime: 60_000,
  })

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isLoading) return

    // If the backend is temporarily unavailable, keep the current route mounted.
    // A failed auth refresh during a server restart should not look like logout.
    if (isError) return

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
  }, [user, isError, isLoading, isPublic, pathname, navigate])

  return (
    <>
      <GlobalControls user={user ?? null} hideProfile={pathname === '/settings'} />
      {isLoading ? <LoadingScreen /> : <Outlet />}
    </>
  )
}

type RootUser = Awaited<ReturnType<typeof fetchUser>>

// Top-right controls shown on every screen (theme toggle + profile).
function GlobalControls({ user, hideProfile }: { user: RootUser; hideProfile: boolean }) {
  return (
    <div className="fixed right-3 top-3 z-50 flex items-center gap-2 sm:right-4 sm:top-4">
      <ThemeToggle />
      <ProfileButton user={user} hidden={hideProfile} />
    </div>
  )
}

function ThemeToggle() {
  const { t } = useTranslation()
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('lt-theme', next ? 'dark' : 'light')
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('common.toggleTheme', 'Toggle light/dark theme')}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-lt-border bg-lt-card text-lt-text shadow-lg shadow-black/20 transition-colors hover:border-lt-primary focus:border-lt-primary focus:outline-none focus:ring-2 focus:ring-lt-primary/30"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ProfileButton({ user, hidden }: { user: RootUser; hidden: boolean }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  if (!user || hidden) return null

  const displayName = user.nickname ?? user.name ?? user.email ?? ''
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/settings' })}
      aria-label={t('settings.title')}
      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-lt-border bg-lt-card text-sm font-bold text-lt-text shadow-lg shadow-black/20 transition-colors hover:border-lt-primary focus:border-lt-primary focus:outline-none focus:ring-2 focus:ring-lt-primary/30"
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </button>
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
