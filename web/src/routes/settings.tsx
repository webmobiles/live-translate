import { useState, useRef, useCallback, type ChangeEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LanguageSelector } from '@/components/LanguageSelector'
import { getLang } from '@/lib/languages'
import { saveProfile, uploadAvatar, logout } from '@/lib/api'
import type { User } from '@/types'

export const Route = createFileRoute('/settings')({
  component: SettingsScreen,
})

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
]

function SettingsScreen() {
  const { t, i18n }  = useTranslation()
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

  const [nickname,     setNickname]     = useState(me?.nickname ?? '')
  const [motherLang,   setMotherLang]   = useState(me?.mother_language ?? 'en')
  const [targetLang,   setTargetLang]   = useState(me?.target_language ?? 'en')
  const [avatarSrc,    setAvatarSrc]    = useState(me?.avatar_url ?? null)
  const [showMother,   setShowMother]   = useState(false)
  const [showTarget,   setShowTarget]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error,        setError]        = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const motherInfo = getLang(motherLang)
  const targetInfo = getLang(targetLang)

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setError('')
    try {
      const url = await uploadAvatar(file)
      setAvatarSrc(url)
      queryClient.setQueryData<User | null>(['auth-me'], prev =>
        prev ? { ...prev, avatar_url: url } : prev,
      )
    } catch (err: any) {
      setError(err.message ?? t('common.error.generic'))
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }, [queryClient, t])

  const handleSave = async () => {
    if (!nickname.trim()) { setError(t('common.error.generic')); return }
    setSaving(true)
    setError('')
    try {
      const updated = await saveProfile({
        nickname:       nickname.trim(),
        motherLanguage: motherLang,
        targetLanguage: targetLang,
      })
      queryClient.setQueryData(['auth-me'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message ?? t('common.error.generic'))
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    if (!confirm(t('settings.signOutConfirm'))) return
    await logout()
    queryClient.setQueryData(['auth-me'], null)
    navigate({ to: '/login', search: { error: undefined } })
  }

  return (
    <div className="min-h-screen bg-lt-bg px-6 py-8">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="p-2 -ml-2 text-lt-muted text-2xl hover:text-lt-text transition-colors"
          >
            ←
          </button>
          <h1 className="text-lt-text text-2xl font-bold">{t('settings.title')}</h1>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="relative group focus:outline-none"
            aria-label={t('settings.avatarChange')}
          >
            <div className="w-24 h-24 rounded-full overflow-hidden bg-lt-card border-2 border-lt-border group-hover:border-lt-primary transition-colors">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-4xl">👤</span>
                </div>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar
                ? <span className="text-lt-text text-xs">{t('common.saving')}</span>
                : <span className="text-lt-text text-xs font-medium">{t('settings.avatarChange')}</span>
              }
            </div>
          </button>
          <p className="text-lt-muted text-xs">{t('settings.avatarHint')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Nickname */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('settings.nickname')}
          </label>
          <input
            className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
            placeholder={t('settings.nicknamePlaceholder')}
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={100}
          />
        </div>

        {/* Native language */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('settings.motherLang')}
          </label>
          <button
            onClick={() => setShowMother(true)}
            className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{motherInfo.flag}</span>
              <div className="text-left">
                <p className="text-lt-text font-medium">{motherInfo.name}</p>
                <p className="text-lt-muted text-xs">{motherInfo.code.toUpperCase()}</p>
              </div>
            </div>
            <span className="text-lt-muted text-sm">{t('common.change')}</span>
          </button>
        </div>

        {/* Target language */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('settings.targetLang')}
          </label>
          <button
            onClick={() => setShowTarget(true)}
            className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{targetInfo.flag}</span>
              <div className="text-left">
                <p className="text-lt-text font-medium">{targetInfo.name}</p>
                <p className="text-lt-muted text-xs">{targetInfo.code.toUpperCase()}</p>
              </div>
            </div>
            <span className="text-lt-muted text-sm">{t('common.change')}</span>
          </button>
        </div>

        {/* App language */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('settings.uiLanguage')}
          </label>
          <select
            value={i18n.resolvedLanguage?.split('-')[0] ?? 'en'}
            onChange={e => void i18n.changeLanguage(e.target.value)}
            className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-base focus:outline-none focus:border-lt-primary transition-colors appearance-none"
          >
            {UI_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !nickname.trim()}
          className="bg-lt-primary rounded-2xl py-4 text-lt-text text-lg font-bold hover:bg-lt-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? t('common.saving') : saved ? t('settings.saved') : t('settings.save')}
        </button>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="text-lt-muted text-sm hover:text-lt-danger transition-colors py-2"
        >
          {t('common.signOut')}
        </button>

      </div>

      <LanguageSelector
        visible={showMother}
        selected={motherLang}
        onSelect={lang => { setMotherLang(lang); setShowMother(false) }}
        onClose={() => setShowMother(false)}
      />
      <LanguageSelector
        visible={showTarget}
        selected={targetLang}
        onSelect={lang => { setTargetLang(lang); setShowTarget(false) }}
        onClose={() => setShowTarget(false)}
      />
    </div>
  )
}
