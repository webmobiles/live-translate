import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forgotPassword, verifyEmailCode } from '@/lib/api'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordScreen,
})

const RESEND_COOLDOWN_SECONDS = 60

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function ForgotPasswordScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  function tError(code: string | null) {
    if (!code) return null
    return t(`forgot.error.${code}`, t('forgot.error.auth_failed'))
  }

  async function handleSendCode() {
    if (!isValidEmail(email)) { setError('email_invalid'); return }
    setError(null)
    setSending(true)
    try {
      await forgotPassword(email.trim().toLowerCase())
      setCodeSent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send_failed')
    } finally {
      setSending(false)
    }
  }

  async function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) { setError('invalid_code'); return }
    setError(null)
    setSubmitting(true)
    try {
      await verifyEmailCode(email.trim().toLowerCase(), code)
      navigate({ to: '/reset-password', search: { email: email.trim().toLowerCase() } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'invalid_code')
    } finally {
      setSubmitting(false)
    }
  }

  const canSend = isValidEmail(email) && cooldown === 0 && !sending

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="text-center">
          <h1 className="text-lt-text text-2xl font-bold">{t('forgot.title')}</h1>
          <p className="text-lt-muted text-sm mt-2">{t('forgot.subtitle')}</p>
        </div>

        <form onSubmit={handleContinue} className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-4">
          {error && (
            <div className="bg-lt-danger/10 border border-lt-danger rounded-xl px-4 py-3 text-center">
              <p className="text-lt-danger text-sm">{tError(error)}</p>
            </div>
          )}

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('forgot.emailPlaceholder')}
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
          />

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('forgot.codePlaceholder')}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="flex-1 rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text tracking-[0.3em] outline-none transition-colors placeholder:tracking-normal placeholder:text-lt-muted focus:border-lt-primary"
            />
            <button
              type="button"
              onClick={() => void handleSendCode()}
              disabled={!canSend}
              className="shrink-0 rounded-xl border border-lt-border bg-lt-bg px-4 text-sm font-semibold text-lt-primary transition-colors hover:border-lt-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cooldown > 0 ? t('forgot.resendIn', { seconds: cooldown }) : t('forgot.sendCode')}
            </button>
          </div>
          {codeSent && <p className="text-lt-muted text-xs -mt-1">{t('forgot.codeSent')}</p>}

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full rounded-xl bg-lt-primary px-4 py-3.5 font-semibold text-lt-text transition-colors hover:bg-lt-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('common.loading') : t('forgot.continue')}
          </button>

          <Link to="/login" search={{ error: undefined }} className="text-lt-primary text-sm text-center font-semibold hover:underline">
            {t('forgot.backToLogin')}
          </Link>
        </form>

      </div>
    </div>
  )
}
