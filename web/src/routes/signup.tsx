import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { sendEmailCode, verifyEmailCode, authenticateWithEmail } from '@/lib/api'
import { passwordError } from '@/lib/validation'

export const Route = createFileRoute('/signup')({
  component: SignupScreen,
})

// TODO: repoint these to the real Terms of Service / Privacy Policy pages.
const TERMS_URL = 'https://example.com/terms'
const PRIVACY_URL = 'https://example.com/privacy'

const RESEND_COOLDOWN_SECONDS = 60

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function SignupScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)

  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [cooldown, setCooldown] = useState(0)
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const lastVerified = useRef('')

  // Resend cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  function tError(code: string | null) {
    if (!code) return null
    return t(`signup.error.${code}`, t('signup.error.auth_failed'))
  }

  async function handleSendCode() {
    if (!isValidEmail(email)) { setError('email_invalid'); return }
    setError(null)
    setSending(true)
    try {
      await sendEmailCode(email.trim().toLowerCase())
      setCodeSent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send_failed')
    } finally {
      setSending(false)
    }
  }

  async function verify(nextCode: string) {
    if (lastVerified.current === nextCode) return
    lastVerified.current = nextCode
    setVerifying(true)
    setCodeError(null)
    try {
      await verifyEmailCode(email.trim().toLowerCase(), nextCode)
      setVerified(true)
    } catch (err) {
      setVerified(false)
      setCodeError(err instanceof Error ? err.message : 'invalid_code')
    } finally {
      setVerifying(false)
    }
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (verified) setVerified(false)
    if (codeError) setCodeError(null)
    if (digits.length === 6) void verify(digits)
  }

  async function handleCreateAccount() {
    if (!verified || passwordError(password) || !accepted) return
    setError(null)
    setSubmitting(true)
    try {
      const result = await authenticateWithEmail({ mode: 'signup', email: email.trim().toLowerCase(), password })
      queryClient.setQueryData(['auth-me'], result.user)
      navigate({ to: result.needsOnboarding ? '/onboarding' : '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'auth_failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSend = isValidEmail(email) && cooldown === 0 && !sending
  const pwError = password ? passwordError(password) : null
  const canCreate = verified && !passwordError(password) && accepted && !submitting

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-lt-primary flex items-center justify-center shadow-lg">
            <span className="text-4xl">🌐</span>
          </div>
          <div className="text-center">
            <h1 className="text-lt-text text-3xl font-bold tracking-tight">HelloVia Translate</h1>
            <p className="text-lt-muted text-sm mt-1">{t('signup.subtitle')}</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-5">
          <div className="text-center">
            <h2 className="text-lt-text text-xl font-semibold">{t('signup.title')}</h2>
          </div>

          {error && (
            <div className="bg-lt-danger/10 border border-lt-danger rounded-xl px-4 py-3 text-center">
              <p className="text-lt-danger text-sm">{tError(error)}</p>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); void handleCreateAccount() }}
            className="flex flex-col gap-3"
          >
            {/* Email */}
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setVerified(false); lastVerified.current = '' }}
              placeholder={t('signup.emailPlaceholder')}
              type="email"
              autoComplete="email"
              required
              disabled={verified}
              className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary disabled:opacity-60 disabled:cursor-not-allowed"
            />

            {/* Verification code + send button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder={t('signup.codePlaceholder')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={verified}
                  className={`w-full rounded-xl border bg-lt-bg px-4 py-3 pr-10 text-lt-text tracking-[0.3em] outline-none transition-colors placeholder:tracking-normal placeholder:text-lt-muted focus:border-lt-primary disabled:cursor-not-allowed ${verified ? 'border-green-500' : 'border-lt-border'}`}
                />
                {verified && (
                  <span className="absolute inset-y-0 right-3 flex items-center text-green-500" aria-label={t('signup.verified')}>✓</span>
                )}
              </div>
              {!verified && (
                <button
                  type="button"
                  onClick={() => void handleSendCode()}
                  disabled={!canSend}
                  className="shrink-0 rounded-xl border border-lt-border bg-lt-bg px-4 text-sm font-semibold text-lt-primary transition-colors hover:border-lt-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cooldown > 0 ? t('signup.resendIn', { seconds: cooldown }) : t('signup.sendCode')}
                </button>
              )}
            </div>
            {codeError && <p className="text-lt-danger text-xs -mt-1">{tError(codeError)}</p>}
            {!codeError && verifying && <p className="text-lt-muted text-xs -mt-1">…</p>}
            {!codeError && !verified && codeSent && <p className="text-lt-muted text-xs -mt-1">{t('signup.codeSent')}</p>}

            {/* Password */}
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('signup.passwordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 pr-11 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-lt-muted hover:text-lt-primary transition-colors"
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            {pwError && <p className="text-lt-danger text-xs -mt-1">{t(`signup.error.${pwError}`, t('signup.error.password_too_short'))}</p>}

            {/* Terms / privacy acceptance */}
            <label className="flex items-start gap-2 text-xs text-lt-muted leading-relaxed">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-lt-primary"
              />
              <span>
                {t('signup.agreePrefix')}{' '}
                <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-lt-primary hover:underline">{t('signup.terms')}</a>
                {' '}{t('signup.and')}{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-lt-primary hover:underline">{t('signup.privacy')}</a>
              </span>
            </label>

            <button
              type="submit"
              disabled={!canCreate}
              className="w-full rounded-xl bg-lt-primary px-4 py-3.5 font-semibold text-lt-text transition-colors hover:bg-lt-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t('common.loading') : t('signup.createAccount')}
            </button>
          </form>

          <p className="text-lt-muted text-sm text-center">
            {t('signup.haveAccount')}{' '}
            <Link to="/login" search={{ error: undefined }} className="text-lt-primary font-semibold hover:underline">{t('signup.signIn')}</Link>
          </p>
        </div>

      </div>
    </div>
  )
}
