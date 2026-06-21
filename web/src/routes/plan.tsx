import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/plan')({
  component: PlanScreen,
})

// Placeholder — the plan / upgrade page is intentionally blank for now.
function PlanScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()

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
          <h1 className="text-lt-text text-2xl font-bold">{t('plan.title')}</h1>
        </div>
        <p className="text-lt-muted text-sm">{t('plan.comingSoon')}</p>
      </div>
    </div>
  )
}
