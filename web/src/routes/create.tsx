import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { connectSocket, SOLOROOM_SOCKET } from '@/lib/socket'
import { fetchUser } from '@/lib/api'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { RoomConfig } from '@/types'

export const Route = createFileRoute('/create')({
  component: CreateScreen,
})

type RoomMode = 'normal' | 'solo_multilang'

function CreateScreen() {
  const { t }        = useTranslation()
  const navigate     = useNavigate()
  const { data: me, isError, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  fetchUser,
    retry:    false,
    staleTime: 60_000,
  })

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
  const [roomNameError, setRoomNameError] = useState(false)

  const isSolo = roomMode === 'solo_multilang'

  useEffect(() => {
    if (!isLoading && (isError || !me)) {
      navigate({ to: '/login', search: { error: undefined } })
    }
  }, [isError, isLoading, me, navigate])

  if (isLoading) {
    return <LoadingScreen label={t('common.loading')} />
  }

  if (isError || !me) {
    return <LoadingScreen label={t('common.loading')} />
  }

  const handleCreate = () => {
    if (!roomName.trim()) { setRoomNameError(true); return }
    if (!isSolo && !nickname.trim()) { setError(t('create.errors.nickRequired')); return }
    if (isSolo && soloLangA === soloLangB) { setError(t('create.errors.sameLang')); return }
    setError('')
    setLoading(true)

    const fullConfig: RoomConfig = {
      ...config,
      mode: roomMode,
      soloLanguages: isSolo ? [soloLangA, soloLangB] : null,
      guestDefaultLanguage: isSolo ? null : guestLang,
    }

    if (isSolo && !SOLOROOM_SOCKET) {
      void (async () => {
        try {
          const res = await fetch('/api/solo/rooms', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({
              name: roomName.trim(),
              nickname: 'Solo',
              language: soloLangB,
              config: fullConfig,
            }),
          })
          const data = await res.json().catch(() => ({})) as {
            ok?: boolean;
            code?: string;
            room?: { name?: string };
            error?: string;
          }
          setLoading(false)
          if (!res.ok || !data.ok || !data.code) {
            setError(data.error ?? t('common.error.generic'))
            return
          }
          navigate({
            to: '/room/$code',
            params: { code: data.code },
            search: {
              nickname: 'Solo',
              language: soloLangB,
              roomName: data.room?.name ?? data.code,
              isHost: true,
            },
          })
        } catch {
          setLoading(false)
          setError(t('common.error.network'))
        }
      })()
      return
    }

    const socket = connectSocket()
    const doCreate = () => {
      socket.emit(
        'room:create',
        {
          name:     roomName.trim(),
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
            className="p-2 -ml-2 text-lt-muted text-2xl hover:text-lt-text transition-colors"
          >
            ←
          </button>
          <h1 className="text-lt-text text-2xl font-bold">{t('create.title')}</h1>
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
              <span className={`text-sm font-semibold ${!isSolo ? 'text-lt-primary' : 'text-lt-text'}`}>
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
              <span className={`text-sm font-semibold ${isSolo ? 'text-lt-primary' : 'text-lt-text'}`}>
                {t('create.mode.solo')}
              </span>
              <span className="text-xs text-lt-muted text-center leading-snug">
                {t('create.mode.soloSub')}
              </span>
            </button>
          </div>
        </div>

        {/* Room name (required, shown for both modes) */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            {t('create.fields.roomName')}
          </label>
          <input
            className={`bg-lt-card border rounded-xl px-4 py-3.5 text-lt-text text-base placeholder-lt-muted focus:outline-none transition-colors ${roomNameError ? 'border-lt-danger' : 'border-lt-border focus:border-lt-primary'}`}
            placeholder={t('create.fields.roomNamePlaceholder')}
            value={roomName}
            onChange={e => { setRoomName(e.target.value); if (roomNameError) setRoomNameError(false) }}
            maxLength={40}
          />
          {roomNameError && <p className="text-lt-danger text-xs -mt-1">{t('create.errors.roomNameRequired')}</p>}
        </div>

        {/* Normal mode fields */}
        {!isSolo && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('create.fields.yourName')}
              </label>
              <input
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
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
                <span className="text-lt-text text-base">{t('create.fields.yourLanguageSub')}</span>
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
                <span className="text-lt-text/70 text-base">{t('create.fields.guestLanguageSub')}</span>
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
            <label className="flex items-center justify-between gap-3 text-lt-text text-sm">
              <span>{t('create.options.realtimeVoice')}</span>
              <input
                type="checkbox"
                checked={config.voicePipeline === 'direct-voice-translation'}
                onChange={e => setConfig(prev => ({
                  ...prev,
                  voicePipeline: e.target.checked ? 'direct-voice-translation' : 'stt-text-translate',
                }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-lt-text text-sm">
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
          <p className="text-lt-text/70 text-sm leading-relaxed">
            {isSolo ? t('create.info.soloBody') : t('create.info.normalBody')}
          </p>
        </div>

        {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading || (isSolo && soloLangA === soloLangB)}
          className="bg-lt-primary rounded-2xl py-4 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-60"
        >
          <span className="text-lt-text text-lg font-bold">
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

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-4xl">🌐</span>
        <p className="text-lt-muted text-sm">{label}</p>
      </div>
    </div>
  )
}
