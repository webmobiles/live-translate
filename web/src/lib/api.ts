import type { User } from '@/types'

// All /auth calls go through the Vite proxy → Express server
// so cookies are same-origin and no CORS header is needed.

export async function fetchUser(): Promise<User | null> {
  const res = await fetch('/auth/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function authenticateWithEmail(data: {
  mode: 'login' | 'signup'
  email: string
  password: string
  name?: string
}): Promise<{ user: User; needsOnboarding: boolean }> {
  const endpoint = data.mode === 'signup' ? '/auth/email/signup' : '/auth/email/login'
  const res = await fetch(endpoint, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({
      email: data.email,
      password: data.password,
      name: data.name,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Email verification (registration) ───────────────────────────────────────

// Step 1: ask the server to email a 6-digit verification code.
export async function sendEmailCode(email: string): Promise<void> {
  const res = await fetch('/auth/email/send-code', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ email }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

// Step 2: verify the code the user typed. Throws with the server error code
// ('invalid_code' | 'code_expired' | 'too_many_attempts') on failure.
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const res = await fetch('/auth/email/verify-code', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

// ── Password reset (forgot password) ────────────────────────────────────────

// Step 1: email a reset code to a registered account (anti-enumeration: always
// resolves). The code is then checked with verifyEmailCode().
export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch('/auth/password/forgot', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ email }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

// Step 2: set the new password (gated server-side on the verified code).
export async function resetPassword(email: string, password: string): Promise<void> {
  const res = await fetch('/auth/password/reset', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

// ── Room history ────────────────────────────────────────────────────────────

export interface UserRoom {
  code: string
  name: string | null
  lastVisitedAt: string
}

export interface UserRoomsResponse {
  rooms: UserRoom[]
  total: number
  planLimit: number
  capped: boolean
}

// Recent rooms the signed-in user has entered (capped by plan server-side).
export async function fetchUserRooms(limit?: number): Promise<UserRoomsResponse> {
  const qs = limit ? `?limit=${limit}` : ''
  const res = await fetch(`/auth/rooms${qs}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// firstName/lastName/country are optional here: the onboarding flow saves only
// nickname + languages, and the server preserves any field that is omitted. The
// settings screen requires all of them client-side before calling this.
export async function saveProfile(data: {
  nickname: string
  firstName?: string
  lastName?: string
  country?: string
  motherLanguage: string
  targetLanguage: string
}): Promise<User> {
  const res = await fetch('/auth/profile', {
    method:      'PATCH',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadAvatar(file: File): Promise<string> {
  const form = new FormData()
  form.append('avatar', file)
  const res = await fetch('/auth/profile/avatar', {
    method:      'POST',
    credentials: 'include',
    body:        form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.avatar_url as string
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
}

// The bearer token used to authenticate the Socket.IO handshake. Web clients
// authenticate over the session cookie (fetch above), then call this to attach
// the token to their socket so the server can identify the user on the socket
// too — that's what lets the server record per-user room history & usage.
export async function fetchAuthToken(): Promise<string | null> {
  const res = await fetch('/auth/token', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.token as string) ?? null
}
