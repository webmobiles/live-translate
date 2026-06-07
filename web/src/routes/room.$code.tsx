import { useEffect, useRef, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getSocket } from '@/lib/socket'
import { getLang } from '@/lib/languages'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import type { Message, Participant } from '@/types'

export const Route = createFileRoute('/room/$code')({
  validateSearch: (s: Record<string, unknown>) => ({
    nickname: String(s.nickname ?? ''),
    language: String(s.language ?? 'en'),
    roomName: String(s.roomName ?? ''),
    isHost: Boolean(s.isHost),
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
  const socketRef = useRef(getSocket())
  const mySocketId = useRef('')

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

    const rejoin = () => {
      mySocketId.current = socket.id ?? ''
      socket.emit(
        'room:join',
        { code, nickname, language: myLanguageRef.current },
        (res: { ok: boolean; room?: { code: string; name: string }; error?: string }) => {
          if (res.ok) {
            setRoomLost(false)
            setIsConnected(true)
            addSystemMsg('Reconnected to room')
          } else {
            // Room is gone (server restarted). If host, recreate it.
            if (isHost) {
              socket.emit(
                'room:create',
                { name: roomName || undefined, nickname, language: myLanguageRef.current },
                (cr: { ok: boolean; code?: string; error?: string }) => {
                  if (cr.ok) {
                    setRoomLost(false)
                    setIsConnected(true)
                    addSystemMsg('Room recreated after server restart — share the code again if needed')
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
      // First connection is handled by create/join flow before navigating here.
      // Subsequent connects (reconnects) need to rejoin the room.
      if (mySocketId.current) {
        rejoin()
      } else {
        mySocketId.current = socket.id ?? ''
        setIsConnected(true)
      }
    }
    const onDisconnect = () => setIsConnected(false)
    const onParticipantsUpdated = ({ participants: p }: { participants: Participant[] }) => setParticipants(p)
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
          id, original: '…', translated: '…', sender: '', senderLang: myLanguage,
          targetLang: myLanguage, isMine: false, timestamp: Date.now(), isTranslating: true,
        }]
      })
    }
    const onMessageIncoming = (msg: Message) => {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== msg.id)
        return [...filtered, { ...msg, isTranslating: false }]
      })
      setTimeout(scrollToBottom, 100)
    }
    const onMessageError = ({ id }: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== id))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:participants-updated', onParticipantsUpdated)
    socket.on('room:participant-joined', onParticipantJoined)
    socket.on('room:participant-left', onParticipantLeft)
    socket.on('message:translating', onMessageTranslating)
    socket.on('message:incoming', onMessageIncoming)
    socket.on('message:error', onMessageError)

    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:participants-updated', onParticipantsUpdated)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('message:translating', onMessageTranslating)
      socket.off('message:incoming', onMessageIncoming)
      socket.off('message:error', onMessageError)
    }
  }, [addSystemMsg, scrollToBottom, myLanguage])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const sendText = useCallback(() => {
    const text = inputText.trim()
    if (!text || !isConnected) return
    socketRef.current.emit('message:text', { text })
    setInputText('')
  }, [inputText, isConnected])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const startRecording = useCallback(async () => {
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
  }, [])

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

  return (
    <div className="h-screen bg-lt-bg flex flex-col">
      {/* Room lost banner */}
      {roomLost && (
        <div className="bg-lt-danger/20 border-b border-lt-danger px-4 py-3 flex items-center justify-between shrink-0">
          <p className="text-white text-sm">Room ended — the server restarted and this room no longer exists.</p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="text-lt-danger font-semibold text-sm ml-4 shrink-0 hover:opacity-70 transition-opacity"
          >
            New room →
          </button>
        </div>
      )}
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
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-lt-accent' : 'bg-lt-danger'}`} />
            <span className="text-lt-muted text-xs">{isConnected ? 'Live' : 'Reconnecting…'}</span>
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
          disabled={!isConnected}
        />
        {inputText.trim().length > 0 ? (
          <button
            onClick={sendText}
            disabled={!isConnected}
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
            disabled={!isConnected}
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

function MessageBubble({ message }: { message: Message }) {
  const { isMine, sender, senderLang, translated, original, isTranslating, isAudio, timestamp } = message
  const [showOriginal, setShowOriginal] = useState(false)
  const senderInfo = getLang(senderLang)
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
        } ${hasTranslation ? 'cursor-pointer' : ''}`}
      >
        {isAudio && (
          <p className={`text-xs mb-1 ${isMine ? 'text-white/60' : 'text-lt-muted'}`}>🎤 Voice</p>
        )}
        <p className="text-white text-base leading-relaxed">
          {showOriginal ? original : translated}
        </p>
        {hasTranslation && (
          <p className={`text-xs mt-1.5 ${isMine ? 'text-white/50' : 'text-lt-muted'}`}>
            {showOriginal ? '↩ show translation' : `${senderInfo.flag} tap to see original`}
          </p>
        )}
      </div>
      <span className="text-lt-muted text-xs mt-1 mx-1">{time}</span>
    </div>
  )
}
