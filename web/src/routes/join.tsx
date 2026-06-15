import { useState, useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { connectSocket } from '@/lib/socket'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { User } from '@/types'

export const Route = createFileRoute('/join')({
  component: JoinScreen,
})

function JoinScreen() {
  const { t }       = useTranslation()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const me = queryClient.getQueryData<User | null>(['auth-me'])

  const [code, setCode]           = useState('')
  const [nickname, setNickname]   = useState(me?.nickname ?? '')
  const [language, setLanguage]   = useState(me?.mother_language ?? 'en')
  const [langWasAutoSet, setLangWasAutoSet] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const peekRef = useRef(false)

  useEffect(() => {
    if (code.length !== 6 || peekRef.current) return
    peekRef.current = true
    const socket = connectSocket()
    const doPeek = () => {
      socket.emit('room:peek', { code: code.toUpperCase() }, (res: any) => {
        if (res?.ok && res.guestDefaultLanguage) {
          setLanguage(res.guestDefaultLanguage)
          setLangWasAutoSet(true)
        }
      })
    }
    if (socket.connected) doPeek()
    else socket.once('connect', doPeek)
  }, [code])

  useEffect(() => {
    if (code.length !== 6) peekRef.current = false
  }, [code])

  const handleJoin = () => {
    if (!code.trim())     { setError(t('join.errors.codeRequired')); return }
    if (!nickname.trim()) { setError(t('join.errors.nickRequired')); return }
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
            setError(res.error ?? t('join.errors.notFound'))
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
        setError(t('common.error.network'))
      })
    }
  }

  const ready = code.length === 6

  return (
    <div className="min-h-screen bg-lt-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: '/' })} className="p-2 -ml-2 text-lt-muted text-2xl hover:text-lt-text transition-colors">
            ←
          </button>
          <h1 className="text-lt-text text-2xl font-bold">{t('join.title')}</h1>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
              {t('join.fields.code')}
            </label>
            <input
              className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-2xl tracking-widest text-center font-bold placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors uppercase"
              placeholder={t('join.fields.codePlaceholder')}
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
              {t('join.fields.yourName')}
            </label>
            <input
              className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 text-lt-text text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors"
              placeholder={t('join.fields.yourNamePlaceholder')}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={30}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-lt-muted text-sm font-medium uppercase tracking-wider">
                {t('join.fields.yourLanguage')}
              </label>
              {langWasAutoSet && (
                <span className="text-lt-primary text-xs">{t('join.fields.suggestedByHost')}</span>
              )}
            </div>
            <button
              onClick={() => setShowLangPicker(true)}
              className="bg-lt-card border border-lt-border rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-lt-primary transition-colors"
            >
              <span className="text-lt-text text-base">{t('join.fields.yourLanguageSub')}</span>
              <LanguageBadge code={language} />
            </button>
          </div>
        </div>

        {error && <p className="text-lt-danger text-sm text-center">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={loading || !ready}
          className={`rounded-2xl py-4 flex items-center justify-center transition-colors ${
            ready ? 'bg-lt-primary hover:bg-lt-primary-dark' : 'bg-lt-card border border-lt-border'
          } disabled:opacity-60`}
        >
          <span className={`text-lg font-bold ${ready ? 'text-lt-text' : 'text-lt-muted'}`}>
            {loading ? t('join.joining') : t('join.cta')}
          </span>
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
