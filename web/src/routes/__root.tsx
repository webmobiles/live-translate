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

  if (isLoading) return <LoadingScreen />

  return <Outlet />
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
