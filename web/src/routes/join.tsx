import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { connectSocket } from '@/lib/socket'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'

export const Route = createFileRoute('/join')({
  component: JoinScreen,
})

function JoinScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [language, setLanguage] = useState('en')
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = () => {
    if (!code.trim()) { setError('Please enter the 6-character room code.'); return; }
    if (!nickname.trim()) { setError('Please enter your name.'); return; }
    setError('')
    setLoading(true)
    const socket = connectSocket()

    const doJoin = () => {
      socket.emit(
        'room:join',
        { code: code.trim().toUpperCase(), nickname: nickname.trim(), language },
        (res: { ok: boolean; room?: { code: string; name: string }; error?: string }) => {
          setLoading(false)
          if (res.ok && res.room) {
            navigate({
              to: '/room/$code',
              params: { code: res.room.code },
              search: { nickname: nickname.trim(), language, roomName: res.room.name, isHost: false },
            })
          } else {
            setError(res.error ?? 'Room not found. Check the code.')
          }
        },
      )
    }

    if (socket.connected) {
      doJoin()
    } else {
      socket.once('connect', doJoin)
      socket.once('connect_error', () => {
        setLoading(false)
        setError('Could not reach the server. Check your network.')
      })
    }
  }

  const ready = code.length === 6

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: '/' })} className="p-2 -ml-2 text-lt-muted text-2xl hover:text-white transition-colors">
            ←
          </button>
          <h1 className="text-white text-2xl font-bold">Join Room</h1>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              Room Code
            </label>
            <input
              className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-white text-2xl tracking-widest text-center font-bold placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors uppercase"
              placeholder="ABC123"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              autoFocus
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
              <span className="text-white text-base">I want to read in…</span>
              <LanguageBadge code={language} />
            </button>
          </div>
        </div>

        {error && (
          <p className="text-lt-danger text-sm text-center">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleJoin}
          disabled={loading || !ready}
          className={`rounded-2xl py-4 flex items-center justify-center transition-colors ${
            ready ? 'bg-lt-primary hover:bg-lt-primary-dark' : 'bg-lt-card border border-lt-border'
          } disabled:opacity-60`}
        >
          {loading
            ? <span className="text-white text-lg">Joining…</span>
            : <span className={`text-lg font-bold ${ready ? 'text-white' : 'text-lt-muted'}`}>
                Join Room
              </span>
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
