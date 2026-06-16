import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { User } from '@/types'

export const Route = createFileRoute('/')({
  component: HomeScreen,
})

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
]

function HomeScreen() {
  const { t, i18n }  = useTranslation()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

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

        {/* App language — persisted client-side (i18next cookie), independent of
            the room "mother language". */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('settings.uiLanguage')}
          </label>
          <select
            value={i18n.resolvedLanguage?.split('-')[0] ?? 'en'}
            onChange={e => void i18n.changeLanguage(e.target.value)}
            className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-base focus:outline-none focus:border-lt-primary transition-colors appearance-none"
          >
            {UI_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* User bar */}
        {me && (
          <div className="flex items-center justify-between bg-lt-card border border-lt-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              {me.avatar_url
                ? <img src={me.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
                : <span className="text-2xl flex-shrink-0">👤</span>
              }
              <span className="text-lt-text text-sm font-medium truncate">
                {me.nickname ?? me.first_name ?? ''}
              </span>
            </div>
            <button
              onClick={() => navigate({ to: '/settings' })}
              className="text-lt-muted text-xl hover:text-lt-text transition-colors flex-shrink-0 ml-3 p-1"
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        )}

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

      </div>
    </div>
  )
}
