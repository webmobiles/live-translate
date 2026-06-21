import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchUserRooms } from '@/lib/api'

export const Route = createFileRoute('/roomhistory')({
  component: RoomHistoryScreen,
})

function RoomHistoryScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['user-rooms', 'all'],
    queryFn: () => fetchUserRooms(),
    retry: false,
  })

  return (
    <div className="min-h-screen bg-lt-bg px-6 py-8">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="p-2 -ml-2 text-lt-muted text-2xl hover:text-lt-text transition-colors"
            aria-label={t('common.back')}
          >
            ←
          </button>
          <h1 className="text-lt-text text-2xl font-bold">{t('roomHistory.title')}</h1>
        </div>

        {isLoading ? (
          <p className="text-lt-muted text-sm text-center">{t('common.loading')}</p>
        ) : !data || data.rooms.length === 0 ? (
          <p className="text-lt-muted text-sm text-center">{t('roomHistory.empty')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {data.rooms.map((room) => (
                <button
                  key={room.code}
                  onClick={() => navigate({ to: '/join', search: { code: room.code } })}
                  className="flex items-center justify-between gap-2 rounded-xl border border-lt-border bg-lt-card px-4 py-3 text-left transition-colors hover:border-lt-primary"
                >
                  <span className="text-lt-text text-sm font-medium truncate">{room.name || room.code}</span>
                  <span className="text-lt-muted text-xs font-mono flex-shrink-0">{room.code}</span>
                </button>
              ))}
            </div>

            {data.capped && (
              <Link
                to="/plan"
                className="rounded-xl border border-lt-primary bg-lt-primary-muted px-4 py-3 text-center text-lt-primary text-sm font-semibold transition-colors hover:bg-lt-primary/10"
              >
                {t('home.changePlan')}
              </Link>
            )}
          </>
        )}

      </div>
    </div>
  )
}
