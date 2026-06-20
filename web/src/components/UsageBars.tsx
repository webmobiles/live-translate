import { useTranslation } from 'react-i18next'
import type { User } from '@/types'

// One usage row: a Claude-style segmented bar.
//   credit (total)  → faint gray track   (bg-lt-border/40)
//   used            → blue               (bg-lt-primary)
//   balance (left)  → light gray         (bg-lt-border)
function UsageBar({ label, used, credit, valueText, resets }: {
  label: string
  used: number
  credit: number
  valueText: string
  resets?: boolean
}) {
  const { t } = useTranslation()
  const pct = credit > 0 ? Math.min(100, Math.max(0, (used / credit) * 100)) : 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-lt-text font-medium">{label}</span>
        <span className="text-lt-muted tabular-nums">{valueText}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-lt-border/40">
        {credit > 0 && (
          <>
            <div className="bg-lt-primary" style={{ width: `${pct}%` }} />
            <div className="bg-lt-border" style={{ width: `${100 - pct}%` }} />
          </>
        )}
      </div>
      {resets && <span className="text-lt-muted text-[10px]">{t('usage.resetsMonthly')}</span>}
    </div>
  )
}

export function UsageBars({ usage }: { usage: NonNullable<User['usage_balance']> }) {
  const { t } = useTranslation()
  const min = (s: number) => Math.round(s / 60).toLocaleString()
  const num = (n: number) => n.toLocaleString()
  const minUnit = t('usage.minutesShort')
  const wordsUnit = t('usage.words')

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-lt-border bg-lt-card px-4 py-3">
      <span className="text-lt-muted text-xs font-medium uppercase tracking-wider">{t('usage.title')}</span>

      <UsageBar
        label={t('usage.realtime')}
        used={usage.realtime.usedSeconds}
        credit={usage.realtime.creditSeconds}
        valueText={`${min(usage.realtime.usedSeconds)} / ${min(usage.realtime.creditSeconds)} ${minUnit}`}
      />
      <UsageBar
        label={t('usage.voice')}
        used={usage.voice.usedSeconds}
        credit={usage.voice.creditSeconds}
        valueText={`${min(usage.voice.usedSeconds)} / ${min(usage.voice.creditSeconds)} ${minUnit}`}
        resets
      />
      <UsageBar
        label={t('usage.text')}
        used={usage.text.usedWords}
        credit={usage.text.creditWords}
        valueText={`${num(usage.text.usedWords)} / ${num(usage.text.creditWords)} ${wordsUnit}`}
        resets
      />
    </div>
  )
}
