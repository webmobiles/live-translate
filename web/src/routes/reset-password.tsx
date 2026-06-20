import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resetPassword } from '@/lib/api'
import { passwordError } from '@/lib/validation'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === 'string' ? s.email : '',
  }),
  component: ResetPasswordScreen,
})

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

function ResetPasswordScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { email } = Route.useSearch()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reached without an email (no verified code) → start over.
  useEffect(() => {
    if (!email) navigate({ to: '/forgot-password' })
  }, [email, navigate])

  function tError(code: string | null) {
    if (!code) return null
    return t(`forgot.error.${code}`, t('forgot.error.auth_failed'))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const pwErr = passwordError(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== confirm) { setError('passwords_mismatch'); return }
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword(email, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'auth_failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="text-center">
          <h1 className="text-lt-text text-2xl font-bold">{t('forgot.resetTitle')}</h1>
          <p className="text-lt-muted text-sm mt-2">{t('forgot.resetSubtitle')}</p>
        </div>

        {done ? (
          <div className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-4 text-center">
            <p className="text-lt-text text-sm">{t('forgot.success')}</p>
            <Link to="/login" search={{ error: undefined }} className="w-full rounded-xl bg-lt-primary px-4 py-3.5 font-semibold text-lt-text transition-colors hover:bg-lt-primary/90">
              {t('forgot.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-4">
            {error && (
              <div className="bg-lt-danger/10 border border-lt-danger rounded-xl px-4 py-3 text-center">
                <p className="text-lt-danger text-sm">{tError(error)}</p>
              </div>
            )}

            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('forgot.newPasswordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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

            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('forgot.confirmPasswordPlaceholder')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="w-full rounded-xl border border-lt-border bg-lt-bg px-4 py-3 text-lt-text outline-none transition-colors placeholder:text-lt-muted focus:border-lt-primary"
            />

            <p className="text-lt-muted text-xs">{t('forgot.passwordHint')}</p>

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full rounded-xl bg-lt-primary px-4 py-3.5 font-semibold text-lt-text transition-colors hover:bg-lt-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t('common.loading') : t('forgot.resetButton')}
            </button>

            <Link to="/login" search={{ error: undefined }} className="text-lt-primary text-sm text-center font-semibold hover:underline">
              {t('forgot.backToLogin')}
            </Link>
          </form>
        )}

      </div>
    </div>
  )
}
