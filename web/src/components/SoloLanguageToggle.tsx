import { getLang } from '@/lib/languages'

interface SoloLanguageToggleProps {
  languages: [string, string]
  active: string
  onChange: (lang: string) => void
  disabled?: boolean
}

export function SoloLanguageToggle({ languages, active, onChange, disabled }: SoloLanguageToggleProps) {
  const [langA, langB] = languages
  const infoA = getLang(langA)
  const infoB = getLang(langB)
  const isA = active === langA

  return (
    <div className="px-3 py-3 border-b border-lt-border bg-lt-bg shrink-0">
      <div className="relative flex rounded-2xl overflow-hidden border border-lt-border bg-lt-card h-16 select-none">

        {/* Sliding highlight */}
        <div
          className={`absolute inset-y-0 w-1/2 rounded-2xl transition-all duration-200 ease-out ${
            isA ? 'left-0 bg-lt-primary' : 'left-1/2 bg-lt-primary'
          }`}
        />

        {/* Language A */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(langA)}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2.5 transition-opacity ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <span className="text-2xl leading-none">{infoA.flag}</span>
          <div className="flex flex-col items-start">
            <span className={`text-sm font-bold leading-tight ${isA ? 'text-white' : 'text-lt-muted'}`}>
              {infoA.name}
            </span>
            {isA && (
              <span className="text-[10px] text-white/60 leading-tight uppercase tracking-wide">
                speaking
              </span>
            )}
          </div>
        </button>

        {/* Divider dot */}
        <div className="relative z-10 flex items-center pointer-events-none">
          <div className="w-px h-8 bg-white/10" />
        </div>

        {/* Language B */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(langB)}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2.5 transition-opacity ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <div className="flex flex-col items-start">
            <span className={`text-sm font-bold leading-tight ${!isA ? 'text-white' : 'text-lt-muted'}`}>
              {infoB.name}
            </span>
            {!isA && (
              <span className="text-[10px] text-white/60 leading-tight uppercase tracking-wide">
                speaking
              </span>
            )}
          </div>
          <span className="text-2xl leading-none">{infoB.flag}</span>
        </button>
      </div>

      <p className="text-center text-xs text-lt-muted mt-2">
        Tap your language side, then speak or type
      </p>
    </div>
  )
}
