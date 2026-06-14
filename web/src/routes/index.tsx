import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { logout } from '@/lib/api'
import type { User } from '@/types'

export const Route = createFileRoute('/')({
  component: HomeScreen,
})

const LANG_CHIPS = ['🇺🇸 EN', '🇪🇸 ES', '🇫🇷 FR', '🇩🇪 DE', '🇨🇳 ZH', '🇯🇵 JA', '🇧🇷 PT', '🇷🇺 RU']

function HomeScreen() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

  const handleLogout = async () => {
    await logout()
    queryClient.setQueryData(['auth-me'], null)
    navigate({ to: '/login' })
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
            <h1 className="text-white text-4xl font-bold tracking-tight">LiveTranslate</h1>
            <p className="text-lt-muted text-base text-center">
              Real-time AI translation across languages
            </p>
          </div>
        </div>

        {/* User bar */}
        {me && (
          <div className="flex items-center justify-between bg-lt-card border border-lt-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              {me.avatar_url && (
                <img src={me.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
              )}
              <span className="text-white text-sm font-medium truncate">
                {me.nickname ?? me.name}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-lt-muted text-xs hover:text-white transition-colors flex-shrink-0 ml-3"
            >
              Sign out
            </button>
          </div>
        )}

        {/* Powered by */}
        <div className="flex items-center justify-center gap-2 bg-lt-card rounded-xl px-4 py-3 border border-lt-border">
          <span className="text-lt-muted text-sm">Powered by</span>
          <span className="text-lt-accent font-semibold text-sm">OpenAI GPT-4o-mini + Whisper</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate({ to: '/create' })}
            className="bg-lt-primary rounded-2xl py-4 flex flex-col items-center hover:bg-lt-primary-dark transition-colors"
          >
            <span className="text-white text-lg font-bold">Create Room</span>
            <span className="text-white/60 text-sm mt-0.5">Start a new translation session</span>
          </button>

          <button
            onClick={() => navigate({ to: '/join' })}
            className="border-2 border-lt-primary rounded-2xl py-4 flex flex-col items-center hover:bg-lt-primary-muted transition-colors"
          >
            <span className="text-lt-primary text-lg font-bold">Join Room</span>
            <span className="text-lt-muted text-sm mt-0.5">Enter a room code to join</span>
          </button>
        </div>

        {/* Language chips */}
        <div className="flex flex-wrap gap-2 justify-center">
          {LANG_CHIPS.map(l => (
            <div key={l} className="bg-lt-card border border-lt-border px-3 py-1.5 rounded-full">
              <span className="text-lt-muted text-xs">{l}</span>
            </div>
          ))}
          <div className="bg-lt-card border border-lt-border px-3 py-1.5 rounded-full">
            <span className="text-lt-muted text-xs">+8 more</span>
          </div>
        </div>

      </div>
    </div>
  )
}
