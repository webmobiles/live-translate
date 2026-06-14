import { createFileRoute, useSearch } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>) => ({
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: LoginScreen,
})

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function LoginScreen() {
  const { error } = useSearch({ from: '/login' })

  const handleGoogleLogin = () => {
    window.location.href = '/auth/google'
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-lt-primary flex items-center justify-center shadow-lg">
            <span className="text-4xl">🌐</span>
          </div>
          <div className="text-center">
            <h1 className="text-white text-3xl font-bold tracking-tight">LiveTranslate</h1>
            <p className="text-lt-muted text-sm mt-1">Real-time translation for everyone</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-lt-card border border-lt-border rounded-2xl p-8 flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-white text-xl font-semibold">Welcome</h2>
            <p className="text-lt-muted text-sm mt-1">Sign in to start translating</p>
          </div>

          {error && (
            <div className="bg-lt-danger/10 border border-lt-danger rounded-xl px-4 py-3 text-center">
              <p className="text-lt-danger text-sm">
                {error === 'oauth_failed'
                  ? 'Google sign-in failed. Please try again.'
                  : 'Something went wrong. Please try again.'}
              </p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800 font-semibold rounded-xl py-3.5 px-4 transition-colors shadow-sm border border-gray-200"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          <p className="text-lt-muted text-xs text-center leading-relaxed">
            By signing in you agree to our terms of service.
            Your data is only used to provide the translation service.
          </p>
        </div>

        <p className="text-lt-muted text-xs text-center">
          No account needed — Google sign-in creates one automatically.
        </p>

      </div>
    </div>
  )
}
