import { useEffect, useRef, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { connectSocket } from '@/lib/socket'
import { getLang } from '@/lib/languages'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { Message, Participant, RoomConfig } from '@/types'

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  input: { text: true, voice: true },
  voicePipeline: 'stt-text-translate',
  output: { translatedText: true, translatedAudio: false },
}

export const Route = createFileRoute('/room/$code')({
  validateSearch: (s: Record<string, unknown>) => ({
    nickname: String(s.nickname ?? ''),
    language: String(s.language ?? 'en'),
    roomName: String(s.roomName ?? ''),
    isHost: s.isHost === true || s.isHost === 'true',
  }),
  component: RoomScreen,
})

function RoomScreen() {
  const { code } = Route.useParams()
  const { nickname, language: initialLang, roomName, isHost } = Route.useSearch()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [inputText, setInputText] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [myLanguage, setMyLanguage] = useState(initialLang)
  const [roomLost, setRoomLost] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [roomConfig, setRoomConfig] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG)
  const [countdown, setCountdown] = useState(4)
  const [isRecording, setIsRecording] = useState(false)
  const [copied, setCopied] = useState(false)

  const myLanguageRef = useRef(initialLang)

  const updateLanguage = useCallback((lang: string) => {
    myLanguageRef.current = lang
    setMyLanguage(lang)
    socketRef.current.emit('room:update-language', { language: lang })
  }, [])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const socketRef = useRef(connectSocket())
  const mySocketId = useRef('')
  const hasSyncedRoom = useRef(false)
  const wasDisconnected = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      original: text, translated: text,
      sender: 'system', senderLang: 'en', targetLang: 'en',
      isMine: false, timestamp: Date.now(),
    }])
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    mySocketId.current = socket.id ?? ''

    const syncRoom = (mode: 'initial' | 'reconnect') => {
      mySocketId.current = socket.id ?? ''
      setConnectionError('')
      socket.timeout(8000).emit(
        'room:join',
        { code, nickname, language: myLanguageRef.current },
        (err: Error | null, res?: { ok: boolean; room?: { code: string; name: string; config?: RoomConfig }; error?: string }) => {
          if (err || !res) {
            setIsConnected(false)
            setConnectionError('Could not reach the server.')
            return
          }

          if (res.ok) {
            setRoomConfig(res.room?.config ?? DEFAULT_ROOM_CONFIG)
            setRoomLost(false)
            setIsConnected(true)
            if (mode === 'reconnect' && wasDisconnected.current) {
              addSystemMsg('Reconnected to room')
            }
            wasDisconnected.current = false
            hasSyncedRoom.current = true
          } else {
            // Room is gone (server restarted). If host, recreate it.
            if (isHost) {
              socket.timeout(8000).emit(
                'room:create',
                { name: roomName || undefined, nickname, language: myLanguageRef.current },
                (createErr: Error | null, cr?: { ok: boolean; code?: string; room?: { name: string; config?: RoomConfig }; error?: string }) => {
                  if (createErr || !cr) {
                    setIsConnected(false)
                    setConnectionError('Could not recreate the room.')
                    return
                  }

                  if (cr.ok) {
                    setRoomConfig(cr.room?.config ?? DEFAULT_ROOM_CONFIG)
                    setRoomLost(false)
                    setIsConnected(true)
                    hasSyncedRoom.current = true
                    addSystemMsg('Room recreated after server restart — share the code again if needed')
                    if (cr.code && cr.code !== code) {
                      navigate({
                        to: '/room/$code',
                        params: { code: cr.code },
                        search: {
                          nickname,
                          language: myLanguageRef.current,
                          roomName: cr.room?.name ?? (roomName || `Room ${cr.code}`),
                          isHost: true,
                        },
                        replace: true,
                      })
                    }
                  } else {
                    setRoomLost(true)
                    setIsConnected(false)
                  }
                },
              )
            } else {
              setRoomLost(true)
              setIsConnected(false)
            }
          }
        },
      )
    }

    const onConnect = () => {
      syncRoom(hasSyncedRoom.current ? 'reconnect' : 'initial')
    }
    const onDisconnect = () => {
      setIsConnected(false)
      wasDisconnected.current = true
    }
    const onConnectError = () => {
      setIsConnected(false)
      setConnectionError('Could not reach the server.')
    }
    const onParticipantsUpdated = ({ participants: p }: { participants: Participant[] }) => setParticipants(p)
    const onConfigUpdated = ({ config }: { config: RoomConfig }) => setRoomConfig(config)
    const onParticipantJoined = ({ participant }: { participant: Participant }) => {
      addSystemMsg(`${participant.nickname} joined (${participant.language.toUpperCase()})`)
    }
    const onParticipantLeft = ({ socketId }: { socketId: string }) => {
      setParticipants(prev => {
        const leaving = prev.find(p => p.socketId === socketId)
        if (leaving) addSystemMsg(`${leaving.nickname} left`)
        return prev.filter(p => p.socketId !== socketId)
      })
    }
    const onMessageTranslating = ({ id }: { id: string }) => {
      setMessages(prev => {
        if (prev.some(m => m.id === id)) return prev
        return [...prev, {
          id, original: '…', translated: '…', sender: '', senderLang: myLanguageRef.current,
          targetLang: myLanguageRef.current, isMine: false, timestamp: Date.now(), isTranslating: true,
        }]
      })
    }
    const onMessageIncoming = (msg: Message) => {
      setMessages(prev => {
        const existing = prev.find(m => m.id === msg.id)
        const filtered = prev.filter(m => m.id !== msg.id)
        const isMine = existing?.isMine ?? msg.isMine
        return [...filtered, {
          ...msg,
          isMine,
          isTranslating: false,
          deliveryStatus: isMine ? 'delivered' : undefined,
        }]
      })
      // Tell the server we've seen these incoming (not-mine) messages
      if (!msg.isMine) {
        socket.emit('message:read', { msgIds: [msg.id] })
      }
      setTimeout(scrollToBottom, 100)
    }
    const onMessageError = ({ id }: { id: string }) => {
      setMessages(prev => prev.flatMap(m => {
        if (m.id !== id) return [m]
        return m.isMine ? [{ ...m, deliveryStatus: 'failed' as const }] : []
      }))
    }
    const onMessageDelivered = ({ id }: { id: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === id && m.isMine && m.deliveryStatus !== 'read'
          ? { ...m, deliveryStatus: 'delivered' as const }
          : m
      ))
    }
    const onMessageRead = ({ id }: { id: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === id && m.isMine ? { ...m, deliveryStatus: 'read' as const } : m
      ))
    }

    // Load chat history sent by server on join
    const onHistory = ({ messages: history }: { messages: Message[] }) => {
      setMessages(history)
      setTimeout(scrollToBottom, 100)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room:participants-updated', onParticipantsUpdated)
    socket.on('room:config-updated', onConfigUpdated)
    socket.on('room:participant-joined', onParticipantJoined)
    socket.on('room:participant-left', onParticipantLeft)
    socket.on('message:translating', onMessageTranslating)
    socket.on('message:incoming', onMessageIncoming)
    socket.on('message:error', onMessageError)
    socket.on('message:delivered', onMessageDelivered)
    socket.on('message:read', onMessageRead)
    socket.on('room:history', onHistory)

    if (socket.connected) {
      syncRoom(hasSyncedRoom.current ? 'reconnect' : 'initial')
    } else {
      setIsConnected(false)
      socket.connect()
    }

    // Mark history messages as read on mount/focus
    const markHistoryRead = () => {
      setMessages(prev => {
        const unreadIds = prev.filter(m => !m.isMine && m.id).map(m => m.id)
        if (unreadIds.length > 0) socket.emit('message:read', { msgIds: unreadIds })
        return prev
      })
    }
    markHistoryRead()
    window.addEventListener('focus', markHistoryRead)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room:participants-updated', onParticipantsUpdated)
      socket.off('room:config-updated', onConfigUpdated)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('message:translating', onMessageTranslating)
      socket.off('message:incoming', onMessageIncoming)
      socket.off('message:error', onMessageError)
      socket.off('message:delivered', onMessageDelivered)
      socket.off('message:read', onMessageRead)
      socket.off('room:history', onHistory)
      window.removeEventListener('focus', markHistoryRead)
    }
  }, [addSystemMsg, code, isHost, navigate, nickname, roomName, scrollToBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Auto-redirect when room is lost
  useEffect(() => {
    if (!roomLost) return
    setCountdown(4)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); navigate({ to: '/' }); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [roomLost, navigate])

  const sendText = useCallback(() => {
    const text = inputText.trim()
    if (!text || !isConnected || !roomConfig.input.text) return
    const id = crypto.randomUUID()
    setMessages(prev => [...prev, {
      id,
      original: text,
      translated: text,
      sender: nickname || 'Me',
      senderLang: myLanguageRef.current,
      targetLang: myLanguageRef.current,
      isMine: true,
      timestamp: Date.now(),
      isTranslating: false,
      deliveryStatus: 'sending',
    }])
    socketRef.current.timeout(8000).emit(
      'message:text',
      { text, clientMsgId: id },
      (err: Error | null, res?: { ok: boolean; id?: string; error?: string }) => {
        setMessages(prev => prev.map(m => {
          if (m.id !== id) return m
          if (err || !res?.ok) return { ...m, deliveryStatus: 'failed' as const }
          return { ...m, deliveryStatus: 'queued' as const }
        }))
      },
    )
    setInputText('')
  }, [inputText, isConnected, nickname, roomConfig.input.text])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const startRecording = useCallback(async () => {
    if (!roomConfig.input.voice) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
    } catch {
      alert('Microphone access is required for voice messages.')
    }
  }, [roomConfig.input.voice])

  const stopAndSend = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        socketRef.current.emit('message:audio', { audioBase64: base64, mimeType: 'audio/webm' })
      }
      reader.readAsDataURL(blob)
      mr.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null
    }
    mr.stop()
    setIsRecording(false)
  }, [])

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updateRoomConfig = (next: RoomConfig) => {
    setRoomConfig(next)
    socketRef.current.timeout(8000).emit(
      'room:update-config',
      { config: next },
      (err: Error | null, res?: { ok: boolean; config?: RoomConfig }) => {
        if (err || !res?.ok) {
          setRoomConfig(roomConfig)
          return
        }
        setRoomConfig(res.config ?? next)
      },
    )
  }

  if (roomLost) {
    return (
      <div className="h-screen bg-lt-bg flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-lt-danger/20 border border-lt-danger flex items-center justify-center">
          <span className="text-4xl">🚪</span>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-white text-2xl font-bold">This room no longer exists</h2>
          <p className="text-lt-muted text-base">
            The room <span className="text-white font-mono font-bold">{code}</span> was closed or the server restarted.
          </p>
        </div>
        <p className="text-lt-muted text-sm">
          Redirecting to home in <span className="text-white font-bold">{countdown}</span>s…
        </p>
        <button
          onClick={() => navigate({ to: '/' })}
          className="bg-lt-primary rounded-2xl px-8 py-3 text-white font-bold hover:bg-lt-primary-dark transition-colors"
        >
          Go home now
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen bg-lt-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-lt-border gap-3 shrink-0">
        <button onClick={() => navigate({ to: '/' })} className="p-1 text-lt-muted text-xl hover:text-white transition-colors">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base truncate">{roomName || code}</p>
          <div className="flex items-center gap-2">
            <button onClick={copyCode} className="text-lt-accent text-xs font-mono font-bold hover:opacity-70 transition-opacity">
              {code} {copied ? '✓' : '📋'}
            </button>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-lt-accent' : 'bg-yellow-500'}`} />
            <span className="text-lt-muted text-xs">
              {isConnected ? 'Live' : connectionError || 'Connecting…'}
            </span>
          </div>
        </div>
        <LanguageBadge code={myLanguage} onClick={() => setShowLangPicker(true)} />
      </div>

      {/* Participants */}
      {participants.length > 0 && (
        <div className="flex gap-2 px-3 py-2.5 border-b border-lt-border overflow-x-auto shrink-0">
          {participants.map(p => {
            const lang = getLang(p.language)
            const isMe = p.socketId === mySocketId.current
            return (
              <div
                key={p.socketId}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0 ${
                  isMe ? 'bg-lt-primary-muted border-lt-primary' : 'bg-lt-card border-lt-border'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className={`text-sm font-medium ${isMe ? 'text-lt-primary' : 'text-white'}`}>
                  {p.nickname}{p.isHost ? ' 👑' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {isHost && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-3 py-2.5 border-b border-lt-border bg-lt-bg shrink-0">
          <label className="flex items-center gap-2 text-lt-muted text-xs">
            <input
              type="checkbox"
              checked={roomConfig.input.text}
              onChange={e => updateRoomConfig({ ...roomConfig, input: { ...roomConfig.input, text: e.target.checked } })}
            />
            <span>Text</span>
          </label>
          <label className="flex items-center gap-2 text-lt-muted text-xs">
            <input
              type="checkbox"
              checked={roomConfig.input.voice}
              onChange={e => updateRoomConfig({ ...roomConfig, input: { ...roomConfig.input, voice: e.target.checked } })}
            />
            <span>Voice</span>
          </label>
          <select
            className="col-span-2 sm:col-span-1 bg-lt-card border border-lt-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-lt-primary"
            value={roomConfig.voicePipeline}
            onChange={e => updateRoomConfig({ ...roomConfig, voicePipeline: e.target.value as RoomConfig['voicePipeline'] })}
          >
            <option value="stt-text-translate">STT</option>
            <option value="direct-voice-translation">Direct voice</option>
          </select>
          <label className="flex items-center gap-2 text-lt-muted text-xs">
            <input
              type="checkbox"
              checked={roomConfig.output.translatedText}
              onChange={e => updateRoomConfig({ ...roomConfig, output: { ...roomConfig.output, translatedText: e.target.checked } })}
            />
            <span>Text out</span>
          </label>
          <label className="flex items-center gap-2 text-lt-muted text-xs">
            <input
              type="checkbox"
              checked={roomConfig.output.translatedAudio}
              onChange={e => updateRoomConfig({ ...roomConfig, output: { ...roomConfig.output, translatedAudio: e.target.checked } })}
            />
            <span>Audio out</span>
          </label>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <span className="text-4xl">🌐</span>
            <p className="text-lt-muted text-center text-sm px-8">
              Send a message or hold the mic button to speak.<br />
              Everyone gets it in their own language.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-auto">
            {messages.map(msg =>
              msg.sender === 'system' ? (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-lt-muted text-xs bg-lt-card px-3 py-1 rounded-full">{msg.original}</span>
                </div>
              ) : (
                <MessageBubble key={msg.id} message={msg} />
              )
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="flex items-end px-4 py-3 border-t border-lt-border gap-3 shrink-0">
        <textarea
          className="flex-1 bg-lt-card border border-lt-border rounded-2xl px-4 py-3 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors resize-none max-h-28"
          placeholder={`Message in ${myLanguage.toUpperCase()}…`}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={!isConnected || !roomConfig.input.text}
        />
        {inputText.trim().length > 0 ? (
          <button
            onClick={sendText}
            disabled={!isConnected || !roomConfig.input.text}
            className="bg-lt-primary rounded-full w-12 h-12 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <span className="text-white text-xl">↑</span>
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopAndSend}
            onTouchStart={startRecording}
            onTouchEnd={stopAndSend}
            disabled={!isConnected || !roomConfig.input.voice}
            className={`rounded-full w-12 h-12 flex items-center justify-center transition-all disabled:opacity-50 shrink-0 ${
              isRecording ? 'bg-lt-danger scale-110' : 'bg-lt-primary hover:bg-lt-primary-dark'
            }`}
          >
            <span className="text-xl">{isRecording ? '⏹' : '🎤'}</span>
          </button>
        )}
      </div>

      <LanguageSelector
        visible={showLangPicker}
        selected={myLanguage}
        onSelect={updateLanguage}
        onClose={() => setShowLangPicker(false)}
      />
    </div>
  )
}

// ── WhatsApp-style delivery icons ─────────────────────────────────────────

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline-block opacity-60">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function IconSingleCheck({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="inline-block">
      <polyline points="1,6 5,10 14,1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconDoubleCheck({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none" className="inline-block">
      <polyline points="1,6 5,10 14,1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="6,6 10,10 19,1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function DeliveryIcon({ status }: { status?: Message['deliveryStatus'] }) {
  if (!status) return null
  if (status === 'sending')   return <IconClock />
  if (status === 'queued')    return <IconSingleCheck color="#9ca3af" />
  if (status === 'delivered') return <IconDoubleCheck color="#9ca3af" />
  if (status === 'read')      return <IconDoubleCheck color="#34d399" />
  if (status === 'failed')    return <span className="text-lt-danger text-xs">!</span>
  return null
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const elapsedMs = Date.now() - date.getTime()
  if (elapsedMs < 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const minutesAgo = Math.floor(elapsedMs / 60000)
  if (minutesAgo < 1) return 'now'
  if (minutesAgo < 60) return `${minutesAgo} min ago`

  const hoursAgo = Math.floor(elapsedMs / 3600000)
  if (hoursAgo < 24) return `${hoursAgo}h ago`

  const daysAgo = Math.floor(elapsedMs / 86400000)
  if (daysAgo < 7) return daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`

  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const { isMine, sender, senderLang, translated, original, isTranslating, isAudio, translatedAudio, timestamp, deliveryStatus } = message
  const [showOriginal, setShowOriginal] = useState(false)
  const senderInfo = getLang(senderLang)
  const time = formatMessageTime(timestamp)
  const hasTranslation = translated !== original

  if (isTranslating) {
    return (
      <div className={`flex mb-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] px-4 py-3 rounded-2xl ${isMine ? 'bg-lt-primary rounded-br-sm' : 'bg-lt-card rounded-bl-sm border border-lt-border'}`}>
          <span className="text-lt-muted text-sm">…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {!isMine && (
        <div className="flex items-center gap-1.5 mb-1 ml-1">
          <span className="text-base">{senderInfo.flag}</span>
          <span className="text-lt-muted text-xs font-medium">{sender}</span>
        </div>
      )}
      <div
        onClick={() => hasTranslation && setShowOriginal(v => !v)}
        className={`max-w-[78%] px-4 py-3 rounded-2xl transition-opacity ${
          isMine ? 'bg-lt-primary rounded-br-sm' : 'bg-lt-card rounded-bl-sm border border-lt-border'
        } ${deliveryStatus === 'failed' ? 'border border-lt-danger' : ''} ${hasTranslation ? 'cursor-pointer' : ''}`}
      >
        {isAudio && (
          <p className={`text-xs mb-1 ${isMine ? 'text-white/60' : 'text-lt-muted'}`}>🎤 Voice</p>
        )}
        <p className="text-white text-base leading-relaxed">
          {showOriginal ? original : translated}
        </p>
        {translatedAudio && (
          <audio
            className="mt-2 w-full max-w-64"
            controls
            src={`data:${translatedAudio.mimeType};base64,${translatedAudio.audioBase64}`}
          />
        )}
        {hasTranslation && (
          <p className={`text-xs mt-1.5 ${isMine ? 'text-white/50' : 'text-lt-muted'}`}>
            {showOriginal ? '↩ show translation' : `${senderInfo.flag} tap to see original`}
          </p>
        )}
      </div>
      {/* Timestamp + delivery icon (only shown on my messages) */}
      <div className={`flex items-center gap-1 mt-1 mx-1 ${deliveryStatus === 'failed' ? 'text-lt-danger' : 'text-lt-muted'}`}>
        <span className="text-xs">{time}</span>
        {isMine && <DeliveryIcon status={deliveryStatus} />}
      </div>
    </div>
  )
}
