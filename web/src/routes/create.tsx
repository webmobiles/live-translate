import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { connectSocket } from '@/lib/socket'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { RoomConfig } from '@/types'

export const Route = createFileRoute('/create')({
  component: CreateScreen,
})

function CreateScreen() {
  const navigate = useNavigate()
  const [roomName, setRoomName] = useState('')
  const [nickname, setNickname] = useState('')
  const [language, setLanguage] = useState('en')
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [config, setConfig] = useState<RoomConfig>({
    input: { text: true, voice: true },
    voicePipeline: 'stt-text-translate',
    output: { translatedText: true, translatedAudio: false },
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = () => {
    if (!nickname.trim()) { setError('Please enter your name.'); return; }
    setError('')
    setLoading(true)
    const socket = connectSocket()

    const doCreate = () => {
      socket.emit(
        'room:create',
        { name: roomName.trim() || undefined, nickname: nickname.trim(), language, config },
        (res: { ok: boolean; code?: string; room?: { name: string }; error?: string }) => {
          setLoading(false)
          if (res.ok && res.code) {
            navigate({
              to: '/room/$code',
              params: { code: res.code },
              search: { nickname: nickname.trim(), language, roomName: res.room?.name ?? res.code, isHost: true },
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
          <button onClick={() => navigate({ to: '/' })} className="p-2 -ml-2 text-lt-muted text-2xl hover:text-white transition-colors">
            ←
          </button>
          <h1 className="text-white text-2xl font-bold">Create Room</h1>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              Room Name (optional)
            </label>
            <input
              className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
              placeholder="e.g. Team Meeting, Conference..."
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

          <div className="flex flex-col gap-3">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              Room Modes
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
        </div>

        {/* Info */}
        <div className="bg-lt-primary-muted border border-lt-primary rounded-xl p-4 flex flex-col gap-2">
          <p className="text-lt-primary font-semibold">How it works</p>
          <p className="text-white/70 text-sm leading-relaxed">
            Share the room code with others. Each person selects their language.
            Messages are translated live by OpenAI — everyone reads in their own language.
          </p>
        </div>

        {error && (
          <p className="text-lt-danger text-sm text-center">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="bg-lt-primary rounded-2xl py-4 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-60"
        >
          {loading
            ? <span className="text-white text-lg">Creating…</span>
            : <span className="text-white text-lg font-bold">Create Room</span>
          }
        </button>

      </div>

      <LanguageSelector
        visible={showLangPicker}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setShowLangPicker(false)}
      />
    </div>
  )
}
