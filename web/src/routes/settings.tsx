import { useState, useRef, useCallback, type ChangeEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { getLang } from '@/lib/languages'
import { saveProfile, uploadAvatar, logout } from '@/lib/api'
import { COUNTRY_CODES } from '@live-translate/shared'
import type { User } from '@/types'

export const Route = createFileRoute('/settings')({
  component: SettingsScreen,
})

const NAME_MAX = 40

// Error messages are i18n codes (looked up under settings.error.*), so they can
// be translated where they're rendered. min(1) → 'required', max → 'tooLong'.
const profileSchema = z.object({
  nickname:       z.string().trim().min(1, 'required').max(NAME_MAX, 'tooLong'),
  firstName:      z.string().trim().min(1, 'required').max(NAME_MAX, 'tooLong'),
  lastName:       z.string().trim().min(1, 'required').max(NAME_MAX, 'tooLong'),
  country:        z.string().min(1, 'required'),
  motherLanguage: z.string().min(1, 'required'),
  targetLanguage: z.string().min(1, 'required'),
})

const inputBase =
  'bg-lt-card border rounded-xl px-4 py-3.5 text-lt-text text-base placeholder-lt-muted focus:outline-none transition-colors'

function fieldHasError(field: any) {
  return field.state.meta.isTouched && field.state.meta.errors.length > 0
}

function inputClass(field: any) {
  return `${inputBase} ${fieldHasError(field) ? 'border-lt-danger' : 'border-lt-border focus:border-lt-primary'}`
}

// Per-field error shown directly under the input.
function FieldError({ field }: { field: any }) {
  const { t } = useTranslation()
  if (!fieldHasError(field)) return null
  const first = field.state.meta.errors[0]
  const code = typeof first === 'string' ? first : first?.message
  if (!code) return null
  const message = t(`settings.error.${code}`, { defaultValue: code }) as string
  return <p className="text-lt-danger text-xs mt-1">{message}</p>
}

const labelClass = 'text-lt-muted text-sm font-medium uppercase tracking-wider'

function SettingsScreen() {
  const { t }        = useTranslation()
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

  const [avatarSrc,    setAvatarSrc]    = useState(me?.avatar_url ?? null)
  const [showMother,   setShowMother]   = useState(false)
  const [showTarget,   setShowTarget]   = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [submitError,  setSubmitError]  = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm({
    defaultValues: {
      nickname:       me?.nickname ?? '',
      firstName:      me?.first_name ?? '',
      lastName:       me?.last_name ?? '',
      country:        me?.country ?? '',
      motherLanguage: me?.mother_language ?? 'en',
      targetLanguage: me?.target_language ?? 'en',
    },
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      setSubmitError('')
      try {
        const updated = await saveProfile({
          nickname:       value.nickname.trim(),
          firstName:      value.firstName.trim(),
          lastName:       value.lastName.trim(),
          country:        value.country,
          motherLanguage: value.motherLanguage,
          targetLanguage: value.targetLanguage,
        })
        queryClient.setQueryData(['auth-me'], updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err: any) {
        setSubmitError(err.message ?? t('common.error.generic'))
      }
    },
  })

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setSubmitError('')
    try {
      const url = await uploadAvatar(file)
      setAvatarSrc(url)
      queryClient.setQueryData<User | null>(['auth-me'], prev =>
        prev ? { ...prev, avatar_url: url } : prev,
      )
    } catch (err: any) {
      setSubmitError(err.message ?? t('common.error.generic'))
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }, [queryClient, t])

  const handleLogout = async () => {
    await logout()
    queryClient.setQueryData(['auth-me'], null)
    navigate({ to: '/login', search: { error: undefined } })
  }

  return (
    <div className="min-h-screen bg-lt-bg px-6 py-8">
      <form
        onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void form.handleSubmit() }}
        className="w-full max-w-sm mx-auto flex flex-col gap-8"
      >

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
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
            type="button"
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
        <form.Field name="nickname">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>{t('settings.nickname')}</label>
              <input
                className={inputClass(field)}
                placeholder={t('settings.nicknamePlaceholder')}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                maxLength={NAME_MAX}
              />
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        {/* First name */}
        <form.Field name="firstName">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>{t('settings.firstName')}</label>
              <input
                className={inputClass(field)}
                placeholder={t('settings.firstNamePlaceholder')}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                maxLength={NAME_MAX}
              />
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        {/* Last name */}
        <form.Field name="lastName">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>{t('settings.lastName')}</label>
              <input
                className={inputClass(field)}
                placeholder={t('settings.lastNamePlaceholder')}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                maxLength={NAME_MAX}
              />
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        {/* Country */}
        <form.Field name="country">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>{t('settings.country')}</label>
              <select
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                className={`${inputClass(field)} appearance-none`}
              >
                <option value="" disabled>{t('settings.countryPlaceholder')}</option>
                {[...COUNTRY_CODES]
                  .sort((a, b) => t(`countries.${a}`).localeCompare(t(`countries.${b}`)))
                  .map(code => (
                    <option key={code} value={code}>{t(`countries.${code}`)}</option>
                  ))}
              </select>
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        {/* Native language */}
        <form.Field name="motherLanguage">
          {(field) => {
            const info = getLang(field.state.value)
            return (
              <div className="flex flex-col gap-2">
                <label className={labelClass}>{t('settings.motherLang')}</label>
                <button
                  type="button"
                  onClick={() => setShowMother(true)}
                  className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{info.flag}</span>
                    <div className="text-left">
                      <p className="text-lt-text font-medium">{info.name}</p>
                      <p className="text-lt-muted text-xs">{info.code.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="text-lt-muted text-sm">{t('common.change')}</span>
                </button>
                <FieldError field={field} />
                <LanguageSelector
                  visible={showMother}
                  selected={field.state.value}
                  onSelect={lang => { field.handleChange(lang); setShowMother(false) }}
                  onClose={() => setShowMother(false)}
                />
              </div>
            )
          }}
        </form.Field>

        {/* Target language */}
        <form.Field name="targetLanguage">
          {(field) => {
            const info = getLang(field.state.value)
            return (
              <div className="flex flex-col gap-2">
                <label className={labelClass}>{t('settings.targetLang')}</label>
                <button
                  type="button"
                  onClick={() => setShowTarget(true)}
                  className="bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex items-center justify-between hover:border-lt-primary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{info.flag}</span>
                    <div className="text-left">
                      <p className="text-lt-text font-medium">{info.name}</p>
                      <p className="text-lt-muted text-xs">{info.code.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="text-lt-muted text-sm">{t('common.change')}</span>
                </button>
                <FieldError field={field} />
                <LanguageSelector
                  visible={showTarget}
                  selected={field.state.value}
                  onSelect={lang => { field.handleChange(lang); setShowTarget(false) }}
                  onClose={() => setShowTarget(false)}
                />
              </div>
            )
          }}
        </form.Field>

        {submitError && <p className="text-lt-danger text-sm text-center">{submitError}</p>}

        {/* Save */}
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting: boolean) => (
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-lt-primary rounded-2xl py-4 text-lt-text text-lg font-bold hover:bg-lt-primary-dark transition-colors disabled:opacity-50"
            >
              {isSubmitting ? t('common.saving') : saved ? t('settings.saved') : t('settings.save')}
            </button>
          )}
        </form.Subscribe>

        {/* Sign out */}
        <button
          type="button"
          onClick={() => setConfirmSignOut(true)}
          className="text-lt-muted text-sm hover:text-lt-danger transition-colors py-2"
        >
          {t('common.signOut')}
        </button>

      </form>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t('common.signOut')}
        description={t('settings.signOutConfirm')}
        confirmLabel={t('common.signOut')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleLogout}
        destructive
      />
    </div>
  )
}
