import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchUser, logout } from '@/lib/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { UsageBars } from '@/components/UsageBars'

export const Route = createFileRoute('/')({
  component: HomeScreen,
})

function HomeScreen() {
  const { t }       = useTranslation()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const { data: me, isError, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  fetchUser,
    retry:    false,
    staleTime: 60_000,
  })
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    if (!isLoading && (isError || !me)) {
      navigate({ to: '/login', search: { error: undefined } })
    }
  }, [isError, isLoading, me, navigate])

  if (isLoading) {
    return <LoadingScreen label={t('common.loading')} />
  }

  if (isError || !me) {
    return <LoadingScreen label={t('common.loading')} />
  }

  const handleLogout = async () => {
    await logout()
    queryClient.setQueryData(['auth-me'], null)
    navigate({ to: '/login', search: { error: undefined } })
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl bg-lt-primary-muted border border-lt-primary flex items-center justify-center">
            <span className="text-5xl">🌐</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lt-text text-4xl font-bold tracking-tight">HelloVia Translate</h1>
            <p className="text-lt-muted text-base text-center">{t('home.tagline')}</p>
          </div>
        </div>

        {/* User bar */}
        {me && (
          <div className="flex items-center justify-between gap-3 bg-lt-card border border-lt-border rounded-xl px-3 py-2.5">
            {/* Identity */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-lt-bg border border-lt-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                {me.avatar_url
                  ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-lg leading-none">👤</span>
                }
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-lt-text text-sm font-semibold truncate">
                  {me.nickname ?? me.first_name ?? ''}
                </span>
                {me.plan && (
                  <span className="self-start mt-0.5 rounded-full bg-lt-primary/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-lt-primary">
                    {me.plan}
                  </span>
                )}
              </div>
            </div>

            {/* Sign out (settings lives in the top-right global controls) */}
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex h-9 flex-shrink-0 items-center rounded-full px-3 text-xs font-medium text-lt-muted transition-colors hover:bg-lt-bg hover:text-lt-text"
            >
              {t('common.signOut')}
            </button>
          </div>
        )}

        {/* Usage */}
        {me?.usage_balance && <UsageBars usage={me.usage_balance} />}

        {/* Powered by */}
        <div className="flex items-center justify-center gap-2 bg-lt-card rounded-xl px-4 py-3 border border-lt-border">
          <span className="text-lt-muted text-sm">{t('home.poweredBy')}</span>
          <span className="text-lt-accent font-semibold text-sm">hellovia.app</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate({ to: '/create' })}
            className="bg-lt-primary rounded-2xl py-4 flex flex-col items-center hover:bg-lt-primary-dark transition-colors"
          >
            <span className="text-lt-text text-lg font-bold">{t('home.createRoom')}</span>
            <span className="text-lt-text/60 text-sm mt-0.5">{t('home.createRoomSub')}</span>
          </button>

          <button
            onClick={() => navigate({ to: '/join' })}
            className="border-2 border-lt-primary rounded-2xl py-4 flex flex-col items-center hover:bg-lt-primary-muted transition-colors"
          >
            <span className="text-lt-primary text-lg font-bold">{t('home.joinRoom')}</span>
            <span className="text-lt-muted text-sm mt-0.5">{t('home.joinRoomSub')}</span>
          </button>
        </div>

        <ConfirmDialog
          open={confirmSignOut}
          onOpenChange={setConfirmSignOut}
          title={t('common.signOut')}
          description={t('settings.signOutConfirm')}
          confirmLabel={t('common.signOut')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleLogout}
          destructive
        />

      </div>
    </div>
  )
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-4xl">🌐</span>
        <p className="text-lt-muted text-sm">{label}</p>
      </div>
    </div>
  )
}
