import { useEffect } from 'react'
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

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <>
      <ProfileButton user={user ?? null} hidden={pathname === '/settings'} />
      <Outlet />
    </>
  )
}

type RootUser = Awaited<ReturnType<typeof fetchUser>>

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
      className="fixed right-3 top-3 z-50 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-lt-border bg-lt-card text-sm font-bold text-white shadow-lg shadow-black/20 transition-colors hover:border-lt-primary focus:border-lt-primary focus:outline-none focus:ring-2 focus:ring-lt-primary/30 sm:right-4 sm:top-4"
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
