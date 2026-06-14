import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LanguageSelector } from '@/components/LanguageSelector'
import { getLang } from '@/lib/languages'
import { saveProfile } from '@/lib/api'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingScreen,
})

function OnboardingScreen() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()

  const [step,           setStep]         = useState<1 | 2 | 3>(1)
  const [nickname,       setNickname]      = useState('')
  const [motherLang,     setMotherLang]    = useState('en')
  const [targetLang,     setTargetLang]    = useState('')
  const [showMotherPicker, setShowMotherPicker] = useState(false)
  const [showTargetPicker, setShowTargetPicker] = useState(false)
  const [loading,        setLoading]       = useState(false)
  const [error,          setError]         = useState('')

  const motherInfo = getLang(motherLang)
  const targetInfo = targetLang ? getLang(targetLang) : null

  const handleFinish = async () => {
    if (!targetLang) { setError('Please choose your preferred translation language.'); return }
    setError('')
    setLoading(true)
    try {
      const updated = await saveProfile({
        nickname:       nickname.trim(),
        motherLanguage: motherLang,
        targetLanguage: targetLang,
      })
      // Refresh auth cache so __root re-reads updated profile
      queryClient.setQueryData(['auth-me'], updated)
      navigate({ to: '/' })
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-lt-primary flex items-center justify-center">
            <span className="text-3xl">👋</span>
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold">Almost there!</h1>
            <p className="text-lt-muted text-sm mt-1">Set up your profile in a few seconds</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 justify-center">
          {([1, 2, 3] as const).map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-lt-primary' : s < step ? 'w-4 bg-lt-primary/40' : 'w-4 bg-lt-border'
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Nickname ── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                What should we call you?
              </label>
              <input
                autoFocus
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
                placeholder="Your name or nickname"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={100}
                onKeyDown={e => {
                  if (e.key === 'Enter' && nickname.trim().length >= 2) setStep(2)
                }}
              />
              <p className="text-lt-muted text-xs">
                This shows to other participants. It doesn't need to be unique.
              </p>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={nickname.trim().length < 2}
              className="bg-lt-primary rounded-2xl py-4 text-white font-bold text-base hover:bg-lt-primary-dark transition-colors disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Mother language ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                Your native language
              </label>
              <p className="text-white/60 text-sm">
                This is the language you speak. Rooms you create will default to this.
              </p>
              <button
                onClick={() => setShowMotherPicker(true)}
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{motherInfo.flag}</span>
                  <div className="text-left">
                    <p className="text-white font-medium">{motherInfo.name}</p>
                    <p className="text-lt-muted text-xs">{motherInfo.code.toUpperCase()}</p>
                  </div>
                </div>
                <span className="text-lt-muted text-sm">Change →</span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-lt-card border border-lt-border rounded-2xl py-4 text-lt-muted font-medium hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-2 flex-1 bg-lt-primary rounded-2xl py-4 text-white font-bold hover:bg-lt-primary-dark transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preferred translation language ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                Preferred translation language
              </label>
              <p className="text-white/60 text-sm">
                When others speak, you'll see translations in this language by default.
              </p>

              {targetInfo ? (
                <button
                  onClick={() => setShowTargetPicker(true)}
                  className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{targetInfo.flag}</span>
                    <div className="text-left">
                      <p className="text-white font-medium">{targetInfo.name}</p>
                      <p className="text-lt-muted text-xs">{targetInfo.code.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="text-lt-muted text-sm">Change →</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowTargetPicker(true)}
                  className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-center gap-2 hover:border-lt-primary transition-colors text-lt-muted hover:text-white"
                >
                  <span className="text-xl">🌍</span>
                  <span>Pick a language</span>
                </button>
              )}

              {motherLang && targetLang && motherLang === targetLang && (
                <p className="text-yellow-400 text-xs">
                  ⚠ This is the same as your native language. You can change it.
                </p>
              )}
            </div>

            {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-lt-card border border-lt-border rounded-2xl py-4 text-lt-muted font-medium hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleFinish}
                disabled={!targetLang || loading}
                className="flex-1 bg-lt-primary rounded-2xl py-4 text-white font-bold hover:bg-lt-primary-dark transition-colors disabled:opacity-40"
              >
                {loading ? 'Saving…' : 'Let\'s go 🚀'}
              </button>
            </div>
          </div>
        )}

      </div>

      <LanguageSelector
        visible={showMotherPicker}
        selected={motherLang}
        onSelect={lang => { setMotherLang(lang); setShowMotherPicker(false) }}
        onClose={() => setShowMotherPicker(false)}
      />
      <LanguageSelector
        visible={showTargetPicker}
        selected={targetLang || 'en'}
        onSelect={lang => { setTargetLang(lang); setShowTargetPicker(false) }}
        onClose={() => setShowTargetPicker(false)}
      />
    </div>
  )
}
