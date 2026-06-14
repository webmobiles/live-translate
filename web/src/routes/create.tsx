import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { connectSocket } from '@/lib/socket'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { RoomConfig, User } from '@/types'

export const Route = createFileRoute('/create')({
  component: CreateScreen,
})

type RoomMode = 'normal' | 'solo_multilang'

function CreateScreen() {
  const { t }        = useTranslation()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

  const [roomMode, setRoomMode] = useState<RoomMode>('normal')

  const [roomName, setRoomName]             = useState('')
  const [nickname, setNickname]             = useState(me?.nickname ?? '')
  const [language, setLanguage]             = useState(me?.mother_language ?? 'en')
  const [showLangPicker, setShowLangPicker] = useState(false)

  const [guestLang, setGuestLang]               = useState(me?.target_language ?? 'en')
  const [showGuestPicker, setShowGuestPicker]   = useState(false)

  const [soloLangA, setSoloLangA]               = useState(me?.mother_language ?? 'es')
  const [soloLangB, setSoloLangB]               = useState(me?.target_language ?? 'en')
  const [showSoloPickerA, setShowSoloPickerA]   = useState(false)
  const [showSoloPickerB, setShowSoloPickerB]   = useState(false)

  const [config, setConfig] = useState<Omit<RoomConfig, 'mode' | 'soloLanguages'>>({
    input: { text: true, voice: true },
    voicePipeline: 'stt-text-translate',
    output: { translatedText: true, translatedAudio: true },
  })

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const isSolo = roomMode === 'solo_multilang'

  const handleCreate = () => {
    if (!isSolo && !nickname.trim()) { setError(t('create.errors.nickRequired')); return }
    if (isSolo && soloLangA === soloLangB) { setError(t('create.errors.sameLang')); return }
    setError('')
    setLoading(true)

    const socket = connectSocket()
    const fullConfig: RoomConfig = {
      ...config,
      mode: roomMode,
      soloLanguages: isSolo ? [soloLangA, soloLangB] : null,
      guestDefaultLanguage: isSolo ? null : guestLang,
    }

    const doCreate = () => {
      socket.emit(
        'room:create',
        {
          name:     isSolo ? undefined : (roomName.trim() || undefined),
          nickname: isSolo ? 'Solo'    : nickname.trim(),
          language: isSolo ? soloLangB : language,
          config:   fullConfig,
        },
        (res: { ok: boolean; code?: string; room?: { name: string }; error?: string }) => {
          setLoading(false)
          if (res.ok && res.code) {
            navigate({
              to: '/room/$code',
              params: { code: res.code },
              search: {
                nickname: isSolo ? 'Solo' : nickname.trim(),
                language: isSolo ? soloLangB : language,
                roomName: res.room?.name ?? res.code,
                isHost:   true,
              },
            })
          } else {
            setError(res.error ?? t('common.error.generic'))
          }
        },
      )
    }

    if (socket.connected) {
      doCreate()
    } else {
      socket.once('connect', doCreate)
      socket.once('connect_error', () => {
        setLoading(false)
        setError(t('common.error.network'))
      })
    }
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="p-2 -ml-2 text-lt-muted text-2xl hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="text-white text-2xl font-bold">{t('create.title')}</h1>
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('create.roomType')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRoomMode('normal')}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all ${
                !isSolo ? 'bg-lt-primary-muted border-lt-primary' : 'bg-lt-card border-lt-border hover:border-lt-primary/50'
              }`}
            >
              <span className="text-2xl">👥</span>
              <span className={`text-sm font-semibold ${!isSolo ? 'text-lt-primary' : 'text-white'}`}>
                {t('create.mode.normal')}
              </span>
              <span className="text-xs text-lt-muted text-center leading-snug">
                {t('create.mode.normalSub')}
              </span>
            </button>
            <button
              onClick={() => setRoomMode('solo_multilang')}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all ${
                isSolo ? 'bg-lt-primary-muted border-lt-primary' : 'bg-lt-card border-lt-border hover:border-lt-primary/50'
              }`}
            >
              <span className="text-2xl">🔄</span>
              <span className={`text-sm font-semibold ${isSolo ? 'text-lt-primary' : 'text-white'}`}>
                {t('create.mode.solo')}
              </span>
              <span className="text-xs text-lt-muted text-center leading-snug">
                {t('create.mode.soloSub')}
              </span>
            </button>
          </div>
        </div>

        {/* Normal mode fields */}
        {!isSolo && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('create.fields.roomName')}
              </label>
              <input
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
                placeholder={t('create.fields.roomNamePlaceholder')}
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                maxLength={40}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('create.fields.yourName')}
              </label>
              <input
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
                placeholder={t('create.fields.yourNamePlaceholder')}
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('create.fields.yourLanguage')}
              </label>
              <button
                onClick={() => setShowLangPicker(true)}
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-lt-primary transition-colors"
              >
                <span className="text-white text-base">{t('create.fields.yourLanguageSub')}</span>
                <LanguageBadge code={language} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('create.fields.guestLanguage')}
              </label>
              <button
                onClick={() => setShowGuestPicker(true)}
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-lt-primary transition-colors"
              >
                <span className="text-white/70 text-base">{t('create.fields.guestLanguageSub')}</span>
                <LanguageBadge code={guestLang} />
              </button>
              <p className="text-lt-muted text-xs">{t('create.fields.guestLanguageHint')}</p>
            </div>
          </div>
        )}

        {/* Solo mode language pair */}
        {isSolo && (
          <div className="flex flex-col gap-4">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              {t('create.fields.soloLanguages')}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSoloPickerA(true)}
                className="flex-1 bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex flex-col items-center gap-2 hover:border-lt-primary transition-colors"
              >
                <span className="text-xs text-lt-muted uppercase tracking-wider">{t('create.fields.personA')}</span>
                <LanguageBadge code={soloLangA} />
              </button>
              <div className="text-2xl text-lt-muted select-none">⇄</div>
              <button
                onClick={() => setShowSoloPickerB(true)}
                className="flex-1 bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex flex-col items-center gap-2 hover:border-lt-primary transition-colors"
              >
                <span className="text-xs text-lt-muted uppercase tracking-wider">{t('create.fields.personB')}</span>
                <LanguageBadge code={soloLangB} />
              </button>
            </div>
            {soloLangA === soloLangB && (
              <p className="text-lt-danger text-sm text-center">{t('create.errors.sameLang')}</p>
            )}
          </div>
        )}

        {/* Room config */}
        <div className="flex flex-col gap-3">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('create.options.title')}
          </label>
          <div className="bg-lt-card border border-lt-border rounded-xl p-4 flex flex-col gap-3">
            <select
              className="bg-lt-bg border border-lt-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-lt-primary"
              value={config.voicePipeline}
              onChange={e => setConfig(prev => ({ ...prev, voicePipeline: e.target.value as RoomConfig['voicePipeline'] }))}
            >
              <option value="stt-text-translate">STT then translate</option>
              <option value="direct-voice-translation">{t('create.options.pipeline.direct')}</option>
            </select>
            <label className="flex items-center justify-between gap-3 text-white text-sm">
              <span>{t('create.options.translatedAudio')}</span>
              <input type="checkbox" checked={config.output.translatedAudio}
                onChange={e => setConfig(prev => ({ ...prev, output: { ...prev.output, translatedAudio: e.target.checked } }))} />
            </label>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-lt-primary-muted border border-lt-primary rounded-xl p-4 flex flex-col gap-2">
          <p className="text-lt-primary font-semibold">
            {isSolo ? t('create.info.soloTitle') : t('create.info.normalTitle')}
          </p>
          <p className="text-white/70 text-sm leading-relaxed">
            {isSolo ? t('create.info.soloBody') : t('create.info.normalBody')}
          </p>
        </div>

        {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading || (isSolo && soloLangA === soloLangB)}
          className="bg-lt-primary rounded-2xl py-4 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-60"
        >
          <span className="text-white text-lg font-bold">
            {loading ? t('create.creating') : t('create.cta')}
          </span>
        </button>

      </div>

      <LanguageSelector visible={showLangPicker} selected={language}
        onSelect={setLanguage} onClose={() => setShowLangPicker(false)} />
      <LanguageSelector visible={showGuestPicker} selected={guestLang}
        onSelect={lang => { setGuestLang(lang); setShowGuestPicker(false) }}
        onClose={() => setShowGuestPicker(false)} />
      <LanguageSelector visible={showSoloPickerA} selected={soloLangA}
        onSelect={lang => { setSoloLangA(lang); setShowSoloPickerA(false) }}
        onClose={() => setShowSoloPickerA(false)} />
      <LanguageSelector visible={showSoloPickerB} selected={soloLangB}
        onSelect={lang => { setSoloLangB(lang); setShowSoloPickerB(false) }}
        onClose={() => setShowSoloPickerB(false)} />
    </div>
  )
}
