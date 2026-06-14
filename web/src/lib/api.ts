import type { User } from '@/types'

// All /auth calls go through the Vite proxy → Express server
// so cookies are same-origin and no CORS header is needed.

export async function fetchUser(): Promise<User | null> {
  try {
    const res = await fetch('/auth/me', { credentials: 'include' })
    if (res.status === 401) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch {
    return null
  }
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

export async function saveProfile(data: {
  nickname: string
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
