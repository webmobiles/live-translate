import { LANGUAGES, getLang } from '@/lib/languages';

interface SelectorProps {
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function LanguageSelector({ visible, selected, onSelect, onClose }: SelectorProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-lt-card rounded-t-3xl border-t border-lt-border max-h-[70vh] flex flex-col">
        <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-lt-border" />
          <p className="text-lt-text text-lg font-semibold mt-3">Select Language</p>
        </div>
        <div className="overflow-y-auto pb-8">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { onSelect(lang.code); onClose(); }}
              className={`w-full flex items-center px-5 py-3.5 mx-0 mb-1 rounded-xl text-left transition-colors ${
                selected === lang.code
                  ? 'bg-lt-primary-muted border border-lt-primary'
                  : 'hover:bg-lt-surface'
              }`}
            >
              <span className="text-2xl mr-3">{lang.flag}</span>
              <div className="flex-1">
                <p className="text-lt-text font-medium">{lang.name}</p>
                <p className="text-lt-muted text-sm">{lang.nativeName}</p>
              </div>
              {selected === lang.code && (
                <span className="text-lt-primary text-lg">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface BadgeProps {
  code: string;
  onClick?: () => void;
}

export function LanguageBadge({ code, onClick }: BadgeProps) {
  const lang = getLang(code);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 bg-lt-primary-muted border border-lt-primary px-3 py-1.5 rounded-full cursor-pointer"
    >
      <span className="text-base">{lang.flag}</span>
      <span className="text-lt-primary font-semibold text-sm">{lang.name}</span>
      {onClick && <span className="text-lt-primary text-xs ml-0.5">▾</span>}
    </button>
  );
}
