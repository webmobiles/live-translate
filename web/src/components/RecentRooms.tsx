import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fetchUserRooms } from '@/lib/api'

// Home "Recent rooms" card — last 3 rooms the user entered, with a "more…" link
// to the full /roomhistory page when there are more than shown.
export function RecentRooms() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['user-rooms', 3],
    queryFn: () => fetchUserRooms(3),
    retry: false,
    staleTime: 30_000,
  })

  if (!data || data.rooms.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-lt-border bg-lt-card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-lt-muted text-xs font-medium uppercase tracking-wider">{t('home.recentRooms')}</span>
        {data.total > data.rooms.length && (
          <Link to="/roomhistory" className="text-lt-primary text-xs font-semibold hover:underline">
            {t('home.moreRooms')}
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {data.rooms.map((room) => (
          <button
            key={room.code}
            onClick={() => navigate({ to: '/join', search: { code: room.code } })}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-lt-bg"
          >
            <span className="text-lt-text text-sm font-medium truncate">{room.name || room.code}</span>
            <span className="text-lt-muted text-xs font-mono flex-shrink-0">{room.code}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
