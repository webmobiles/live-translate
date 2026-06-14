import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { connectSocket } from '@/lib/socket'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { RoomConfig } from '@/types'

export const Route = createFileRoute('/create')({
  component: CreateScreen,
})

type RoomMode = 'normal' | 'solo_multilang'

function CreateScreen() {
  const navigate = useNavigate()

  // ── mode ──────────────────────────────────────────────────────────────
  const [roomMode, setRoomMode] = useState<RoomMode>('normal')

  // ── normal mode fields ─────────────────────────────────────────────────
  const [roomName, setRoomName]       = useState('')
  const [nickname, setNickname]       = useState('')
  const [language, setLanguage]       = useState('en')
  const [showLangPicker, setShowLangPicker] = useState(false)

  // ── solo mode fields ───────────────────────────────────────────────────
  const [soloLangA, setSoloLangA] = useState('es')
  const [soloLangB, setSoloLangB] = useState('en')
  const [showSoloPickerA, setShowSoloPickerA] = useState(false)
  const [showSoloPickerB, setShowSoloPickerB] = useState(false)

  // ── shared config ──────────────────────────────────────────────────────
  const [config, setConfig] = useState<Omit<RoomConfig, 'mode' | 'soloLanguages'>>({
    input: { text: true, voice: true },
    voicePipeline: 'stt-text-translate',
    output: { translatedText: true, translatedAudio: false },
  })

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const isSolo = roomMode === 'solo_multilang'

  const handleCreate = () => {
    if (!isSolo && !nickname.trim()) { setError('Please enter your name.'); return }
    if (isSolo && soloLangA === soloLangB) { setError('Please choose two different languages.'); return }
    setError('')
    setLoading(true)

    const socket = connectSocket()
    const fullConfig: RoomConfig = {
      ...config,
      mode: roomMode,
      soloLanguages: isSolo ? [soloLangA, soloLangB] : null,
    }

    const doCreate = () => {
      socket.emit(
        'room:create',
        {
          name:     isSolo ? undefined : (roomName.trim() || undefined),
          nickname: isSolo ? 'Solo'    : nickname.trim(),
          language: isSolo ? soloLangB : language, // join as translation-target language
          config:   fullConfig,
        },
        (res: { ok: boolean; code?: string; room?: { name: string }; error?: string }) => {
          setLoading(false)
          if (res.ok && res.code) {
            navigate({
              to: '/room/$code',
              params: { code: res.code },
              search: {
                nickname:  isSolo ? 'Solo'    : nickname.trim(),
                language:  isSolo ? soloLangB : language,
                roomName:  res.room?.name ?? res.code,
                isHost:    true,
              },
            })
          } else {
            setError(res.error ?? 'Could not create room')
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
        setError('Could not reach the server. Check your network.')
      })
    }
  }

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="p-2 -ml-2 text-lt-muted text-2xl hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="text-white text-2xl font-bold">Create Room</h1>
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            Room Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRoomMode('normal')}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all ${
                !isSolo
                  ? 'bg-lt-primary-muted border-lt-primary'
                  : 'bg-lt-card border-lt-border hover:border-lt-primary/50'
              }`}
            >
              <span className="text-2xl">👥</span>
              <span className={`text-sm font-semibold ${!isSolo ? 'text-lt-primary' : 'text-white'}`}>
                Multi-user
              </span>
              <span className="text-xs text-lt-muted text-center leading-snug">
                Share a code, each person joins with their language
              </span>
            </button>
            <button
              onClick={() => setRoomMode('solo_multilang')}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all ${
                isSolo
                  ? 'bg-lt-primary-muted border-lt-primary'
                  : 'bg-lt-card border-lt-border hover:border-lt-primary/50'
              }`}
            >
              <span className="text-2xl">🔄</span>
              <span className={`text-sm font-semibold ${isSolo ? 'text-lt-primary' : 'text-white'}`}>
                Solo / Duo
              </span>
              <span className="text-xs text-lt-muted text-center leading-snug">
                Two languages, one device — flip to switch speaker
              </span>
            </button>
          </div>
        </div>

        {/* Normal mode fields */}
        {!isSolo && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                Room Name (optional)
              </label>
              <input
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
                placeholder="e.g. Team Meeting, Conference…"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                maxLength={40}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                Your Name
              </label>
              <input
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
                placeholder="Enter your name"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                Your Language
              </label>
              <button
                onClick={() => setShowLangPicker(true)}
                className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-lt-primary transition-colors"
              >
                <span className="text-white text-base">I speak in…</span>
                <LanguageBadge code={language} />
              </button>
            </div>
          </div>
        )}

        {/* Solo mode language pair */}
        {isSolo && (
          <div className="flex flex-col gap-4">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              Choose Two Languages
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSoloPickerA(true)}
                className="flex-1 bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex flex-col items-center gap-2 hover:border-lt-primary transition-colors"
              >
                <span className="text-xs text-lt-muted uppercase tracking-wider">Person A</span>
                <LanguageBadge code={soloLangA} />
              </button>

              <div className="text-2xl text-lt-muted select-none">⇄</div>

              <button
                onClick={() => setShowSoloPickerB(true)}
                className="flex-1 bg-lt-card border border-lt-border rounded-xl px-4 py-4 flex flex-col items-center gap-2 hover:border-lt-primary transition-colors"
              >
                <span className="text-xs text-lt-muted uppercase tracking-wider">Person B</span>
                <LanguageBadge code={soloLangB} />
              </button>
            </div>

            {soloLangA === soloLangB && (
              <p className="text-lt-danger text-sm text-center">Choose two different languages.</p>
            )}
          </div>
        )}

        {/* Room config */}
        <div className="flex flex-col gap-3">
          <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
            Options
          </label>
          <div className="bg-lt-card border border-lt-border rounded-xl p-4 flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 text-white text-sm">
              <span>Text input</span>
              <input
                type="checkbox"
                checked={config.input.text}
                onChange={e => setConfig(prev => ({ ...prev, input: { ...prev.input, text: e.target.checked } }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-white text-sm">
              <span>Voice input</span>
              <input
                type="checkbox"
                checked={config.input.voice}
                onChange={e => setConfig(prev => ({ ...prev, input: { ...prev.input, voice: e.target.checked } }))}
              />
            </label>
            <select
              className="bg-lt-bg border border-lt-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-lt-primary"
              value={config.voicePipeline}
              onChange={e => setConfig(prev => ({ ...prev, voicePipeline: e.target.value as RoomConfig['voicePipeline'] }))}
            >
              <option value="stt-text-translate">STT then translate</option>
              <option value="direct-voice-translation">Direct voice translation</option>
            </select>
            <label className="flex items-center justify-between gap-3 text-white text-sm">
              <span>Translated text</span>
              <input
                type="checkbox"
                checked={config.output.translatedText}
                onChange={e => setConfig(prev => ({ ...prev, output: { ...prev.output, translatedText: e.target.checked } }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-white text-sm">
              <span>Translated audio</span>
              <input
                type="checkbox"
                checked={config.output.translatedAudio}
                onChange={e => setConfig(prev => ({ ...prev, output: { ...prev.output, translatedAudio: e.target.checked } }))}
              />
            </label>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-lt-primary-muted border border-lt-primary rounded-xl p-4 flex flex-col gap-2">
          {isSolo ? (
            <>
              <p className="text-lt-primary font-semibold">How Solo / Duo works</p>
              <p className="text-white/70 text-sm leading-relaxed">
                A big toggle lets you switch who is speaking. Tap your language side, then speak or type.
                The translation appears instantly. No sharing needed — it's just the two of you on one device.
              </p>
            </>
          ) : (
            <>
              <p className="text-lt-primary font-semibold">How it works</p>
              <p className="text-white/70 text-sm leading-relaxed">
                Share the room code with others. Each person selects their language.
                Messages are translated live — everyone reads in their own language.
              </p>
            </>
          )}
        </div>

        {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

        {/* CTA */}
        <button
          onClick={handleCreate}
          disabled={loading || (isSolo && soloLangA === soloLangB)}
          className="bg-lt-primary rounded-2xl py-4 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-60"
        >
          {loading
            ? <span className="text-white text-lg">Creating…</span>
            : <span className="text-white text-lg font-bold">Create Room</span>
          }
        </button>

      </div>

      {/* Language pickers */}
      <LanguageSelector
        visible={showLangPicker}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setShowLangPicker(false)}
      />
      <LanguageSelector
        visible={showSoloPickerA}
        selected={soloLangA}
        onSelect={lang => { setSoloLangA(lang); setShowSoloPickerA(false) }}
        onClose={() => setShowSoloPickerA(false)}
      />
      <LanguageSelector
        visible={showSoloPickerB}
        selected={soloLangB}
        onSelect={lang => { setSoloLangB(lang); setShowSoloPickerB(false) }}
        onClose={() => setShowSoloPickerB(false)}
      />
    </div>
  )
}
