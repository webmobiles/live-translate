import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CircleAlert, Mic, Pause, Play, Send, Square, X } from 'lucide-react'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { getLang } from '@/lib/languages'
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector'
import { SoloLanguageToggle } from '@/components/SoloLanguageToggle'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Message, Participant, RoomConfig } from '@/types'
import type { Socket } from 'socket.io-client'

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  input: { text: true, voice: true },
  voicePipeline: 'stt-text-translate',
  output: { translatedText: true, translatedAudio: true },
}
const MIN_VOICE_MESSAGE_DURATION_MS = 1000
const SILENT_AUDIO_SRC = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

type AudioPlayFailureHandler = (error: unknown) => void
type SharedAudioRequest = {
  src: string;
  context: string;
  onPlaybackError?: AudioPlayFailureHandler;
}
type SharedAudioSnapshot = {
  src: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}
type MessageAudioPayload = NonNullable<Message['translatedAudio']>
type RoomTransport = 'loading' | 'solo-http' | 'socket'

function isPlayableAudioPayload(audio?: MessageAudioPayload | null): audio is MessageAudioPayload {
  return Boolean(audio?.audioBase64 && audio.mimeType?.startsWith('audio/'))
}

function messageCanUseOriginalAudio(message: Pick<Message, 'isMine' | 'senderLang' | 'targetLang'>) {
  return message.isMine || message.targetLang === message.senderLang
}

function messageHasPlayableAudio(message: Pick<Message, 'originalAudio' | 'translatedAudio' | 'isMine' | 'senderLang' | 'targetLang'>) {
  return isPlayableAudioPayload(message.translatedAudio)
    || (messageCanUseOriginalAudio(message) && isPlayableAudioPayload(message.originalAudio))
}

const pendingAutoPlayRequests: SharedAudioRequest[] = []
const sharedAudioListeners = new Set<() => void>()
const loggedAutoPlayFailures = new Set<string>()
let sharedAudioElement: HTMLAudioElement | null = null
let sharedAudioSrc = ''
let sharedAudioCurrentRequest: SharedAudioRequest | null = null
let audioPlaybackUnlocked = false
let audioUnlockInFlight = false

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function describeAudioSrc(src: string) {
  return `${src.slice(0, 60)}${src.length > 60 ? '…' : ''} (${src.length} chars)`
}

function logAutoPlayFailure(src: string, error: unknown, context: string) {
  const key = `${context}:${src.length}:${src.slice(0, 80)}`
  if (loggedAutoPlayFailures.has(key)) return
  loggedAutoPlayFailures.add(key)

  const err = asError(error)
  console.warn('[voice autoplay] failed', {
    context,
    name: err.name,
    message: err.message,
    src: describeAudioSrc(src),
    readyState: sharedAudioElement?.readyState,
    networkState: sharedAudioElement?.networkState,
    paused: sharedAudioElement?.paused,
  })
}

function getSharedAudioSnapshot(): SharedAudioSnapshot {
  const audio = sharedAudioElement
  const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0

  return {
    src: sharedAudioSrc,
    isPlaying: Boolean(audio && !audio.paused && !audio.ended),
    currentTime: audio?.currentTime ?? 0,
    duration,
  }
}

function emitSharedAudioState() {
  sharedAudioListeners.forEach(listener => listener())
}

function subscribeSharedAudioState(listener: () => void) {
  sharedAudioListeners.add(listener)
  return () => {
    sharedAudioListeners.delete(listener)
  }
}

function removePendingAutoPlay(src: string) {
  for (let i = pendingAutoPlayRequests.length - 1; i >= 0; i -= 1) {
    if (pendingAutoPlayRequests[i].src === src) pendingAutoPlayRequests.splice(i, 1)
  }
}

function queuePendingAutoPlay(request: SharedAudioRequest) {
  if (!pendingAutoPlayRequests.some(pending => pending.src === request.src)) {
    pendingAutoPlayRequests.push(request)
  }
}

function clearPendingAutoPlayRequests() {
  pendingAutoPlayRequests.length = 0
}

function getSharedAudioElement() {
  if (sharedAudioElement || typeof Audio === 'undefined') return sharedAudioElement

  const audio = new Audio()
  audio.preload = 'auto'

  audio.addEventListener('play', emitSharedAudioState)
  audio.addEventListener('pause', emitSharedAudioState)
  audio.addEventListener('timeupdate', emitSharedAudioState)
  audio.addEventListener('durationchange', emitSharedAudioState)
  audio.addEventListener('loadedmetadata', emitSharedAudioState)
  audio.addEventListener('ended', () => {
    emitSharedAudioState()
    playNextPendingAutoPlay()
  })
  audio.addEventListener('error', () => {
    const request = sharedAudioCurrentRequest
    if (request) {
      const error = new Error('Audio source failed to load')
      removePendingAutoPlay(request.src)
      logAutoPlayFailure(request.src, error, `${request.context}:load-error`)
      request.onPlaybackError?.(error)
    }
    emitSharedAudioState()
    playNextPendingAutoPlay()
  })

  sharedAudioElement = audio
  return audio
}

async function playSharedAudioSource(request: SharedAudioRequest) {
  const audio = getSharedAudioElement()
  if (!audio) return

  if (sharedAudioSrc !== request.src) {
    audio.pause()
    sharedAudioSrc = request.src
    sharedAudioCurrentRequest = request
    audio.src = request.src
    audio.currentTime = 0
    audio.load()
  } else {
    sharedAudioCurrentRequest = request
    if (audio.ended) audio.currentTime = 0
  }

  try {
    await audio.play()
    audioPlaybackUnlocked = true
    removePendingAutoPlay(request.src)
    emitSharedAudioState()
  } catch (error) {
    const err = asError(error)
    if (err.name === 'AbortError') return

    if (err.name === 'NotAllowedError') {
      queuePendingAutoPlay(request)
      logAutoPlayFailure(request.src, error, request.context)
      emitSharedAudioState()
      return
    }

    removePendingAutoPlay(request.src)
    logAutoPlayFailure(request.src, error, request.context)
    request.onPlaybackError?.(error)
    emitSharedAudioState()
    playNextPendingAutoPlay()
  }
}

function playNextPendingAutoPlay() {
  const audio = getSharedAudioElement()
  if (audio && !audio.paused && !audio.ended) return

  const next = pendingAutoPlayRequests.shift()
  if (next) void playSharedAudioSource({ ...next, context: 'queued-autoplay' })
}

async function unlockSharedAudioPlayback() {
  if (audioPlaybackUnlocked || audioUnlockInFlight) return
  const audio = getSharedAudioElement()
  if (!audio || sharedAudioSrc || !audio.paused) return

  audioUnlockInFlight = true
  const previousVolume = audio.volume

  try {
    audio.volume = 0
    audio.src = SILENT_AUDIO_SRC
    audio.load()
    await audio.play()
    audio.pause()
    audio.currentTime = 0
    audioPlaybackUnlocked = true
  } catch (error) {
    logAutoPlayFailure(SILENT_AUDIO_SRC, error, 'audio-unlock')
  } finally {
    audio.volume = previousVolume
    audio.removeAttribute('src')
    audio.load()
    audioUnlockInFlight = false
    emitSharedAudioState()
  }
}

function retryPendingAutoPlayAudios() {
  void unlockSharedAudioPlayback()
  playNextPendingAutoPlay()
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
  const { t } = useTranslation()
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
  const [roomTransport, setRoomTransport] = useState<RoomTransport>('loading')
  const [countdown, setCountdown] = useState(4)
  const [isRecording, setIsRecording] = useState(false)
  const [copied, setCopied] = useState(false)
  const [voiceAlertVisible, setVoiceAlertVisible] = useState(false)
  const [voiceAutoPlayEnabled, setVoiceAutoPlayEnabled] = useState(true)

  // solo_multilang: which language side is currently "speaking"
  const [soloActiveLang, setSoloActiveLang] = useState<string | null>(null)
  const soloActiveLangRef = useRef<string | null>(null)
  // Derived: always non-null when in solo mode (falls back to soloLanguages[0])
  const effectiveSoloLang = soloActiveLang ?? roomConfig.soloLanguages?.[0] ?? null

  const myLanguageRef = useRef(initialLang)
  const voiceAutoPlayEnabledRef = useRef(true)
  const socketRef = useRef<Socket | null>(null)

  const updateLanguage = useCallback((lang: string) => {
    myLanguageRef.current = lang
    setMyLanguage(lang)
    if (roomTransport === 'socket') {
      socketRef.current?.emit('room:update-language', { language: lang })
    }
  }, [roomTransport])

  // Seed soloActiveLang as soon as roomConfig resolves to solo mode
  useEffect(() => {
    if (roomConfig.mode !== 'solo_multilang' || !roomConfig.soloLanguages) return
    if (soloActiveLangRef.current !== null) return // already seeded
    const [langA, langB] = roomConfig.soloLanguages
    soloActiveLangRef.current = langA
    setSoloActiveLang(langA)
    // Set participant language = translation target (langB receives langA's speech)
    updateLanguage(langB)
  }, [roomConfig.mode, roomConfig.soloLanguages, updateLanguage])

  // Solo toggle: activeLang = who is speaking; myLanguage = translation target (the other lang)
  const handleSoloToggle = useCallback((activeLang: string) => {
    const langs = roomConfig.soloLanguages
    if (!langs) return
    const otherLang = langs.find(l => l !== activeLang) ?? langs[1]
    soloActiveLangRef.current = activeLang
    setSoloActiveLang(activeLang)
    updateLanguage(otherLang) // participant.language = translation target
  }, [roomConfig.soloLanguages, updateLanguage])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef(0)
  const mySocketId = useRef('')
  const hasSyncedRoom = useRef(false)
  const syncInFlight = useRef(false)
  const wasDisconnected = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const updateVoiceAutoPlayEnabled = useCallback((enabled: boolean) => {
    voiceAutoPlayEnabledRef.current = enabled
    setVoiceAutoPlayEnabled(enabled)

    if (enabled) {
      retryPendingAutoPlayAudios()
      return
    }

    clearPendingAutoPlayRequests()
    setMessages(prev => prev.map(message =>
      message.autoPlay ? { ...message, autoPlay: false } : message,
    ))
  }, [])

  useEffect(() => {
    const retry = () => retryPendingAutoPlayAudios()

    window.addEventListener('pointerdown', retry)
    window.addEventListener('keydown', retry)
    window.addEventListener('touchstart', retry)
    if (navigator.userActivation?.hasBeenActive) {
      void unlockSharedAudioPlayback()
    }

    return () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      window.removeEventListener('touchstart', retry)
    }
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
    const abort = new AbortController()

    async function loadRoomTransport() {
      setRoomTransport('loading')
      setConnectionError('')

      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}?language=${encodeURIComponent(myLanguageRef.current)}`, {
          credentials: 'include',
          signal: abort.signal,
        })

        if (abort.signal.aborted) return

        if (res.status === 404) {
          if (isHost) {
            setRoomTransport('socket')
          } else {
            setRoomLost(true)
            setIsConnected(false)
          }
          return
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json() as {
          ok: boolean;
          room?: { config?: RoomConfig; participants?: Participant[] };
          history?: Message[];
          error?: string;
        }
        if (!data.ok || !data.room) throw new Error(data.error || 'Room not found')

        const resolvedConfig = data.room.config ?? DEFAULT_ROOM_CONFIG
        setRoomConfig(resolvedConfig)

        if (resolvedConfig.mode === 'solo_multilang') {
          disconnectSocket()
          const [langA, langB] = resolvedConfig.soloLanguages ?? [initialLang, myLanguageRef.current]
          const targetLang = langB || myLanguageRef.current
          soloActiveLangRef.current = langA
          setSoloActiveLang(langA)
          myLanguageRef.current = targetLang
          setMyLanguage(targetLang)
          setParticipants([])
          setMessages(data.history ?? [])
          setRoomLost(false)
          setIsConnected(true)
          setRoomTransport('solo-http')
          setTimeout(scrollToBottom, 100)
          return
        }

        setParticipants(data.room.participants ?? [])
        setRoomTransport('socket')
      } catch (error) {
        if (abort.signal.aborted) return
        setConnectionError(t('room.error.network'))
        setIsConnected(false)
        setRoomTransport(isHost ? 'socket' : 'loading')
      }
    }

    void loadRoomTransport()

    return () => abort.abort()
  }, [code, initialLang, isHost, scrollToBottom, t])

  useEffect(() => {
    if (roomTransport !== 'socket') return
    const socket = socketRef.current
      ?? (socketRef.current = connectSocket())
    mySocketId.current = socket.id ?? ''

    const syncRoom = (mode: 'initial' | 'reconnect') => {
      if (syncInFlight.current) return
      syncInFlight.current = true
      mySocketId.current = socket.id ?? ''
      setConnectionError('')
      socket.timeout(8000).emit(
        'room:join',
        { code, nickname, language: myLanguageRef.current, isHost },
        (err: Error | null, res?: { ok: boolean; room?: { code: string; name: string; config?: RoomConfig }; error?: string }) => {
          syncInFlight.current = false
          if (err || !res) {
            setIsConnected(false)
            setConnectionError(t('room.error.network'))
            return
          }

          if (res.ok) {
            const resolvedConfig = res.room?.config ?? DEFAULT_ROOM_CONFIG
            setRoomConfig(resolvedConfig)
            if (resolvedConfig.mode === 'solo_multilang' && resolvedConfig.soloLanguages && soloActiveLangRef.current === null) {
              soloActiveLangRef.current = resolvedConfig.soloLanguages[0]
              setSoloActiveLang(resolvedConfig.soloLanguages[0])
            }
            setRoomLost(false)
            setIsConnected(true)
            if (mode === 'reconnect' && wasDisconnected.current) {
              addSystemMsg(t('room.reconnected'))
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
                  syncInFlight.current = false
                  if (createErr || !cr) {
                    setIsConnected(false)
                    setConnectionError(t('room.error.recreate'))
                    return
                  }

                  if (cr.ok) {
                    setRoomConfig(cr.room?.config ?? DEFAULT_ROOM_CONFIG)
                    setRoomLost(false)
                    setIsConnected(true)
                    hasSyncedRoom.current = true
                    addSystemMsg(t('room.recreated'))
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
              syncInFlight.current = false
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
      setConnectionError(t('room.error.network'))
      syncInFlight.current = false
    }
    const onParticipantsUpdated = ({ participants: p }: { participants: Participant[] }) => setParticipants(p)
    const onConfigUpdated = ({ config }: { config: RoomConfig }) => {
      setRoomConfig(config)
      if (config.mode === 'solo_multilang' && config.soloLanguages && soloActiveLangRef.current === null) {
        soloActiveLangRef.current = config.soloLanguages[0]
        setSoloActiveLang(config.soloLanguages[0])
      }
    }
    const onParticipantJoined = ({ participant }: { participant: Participant }) => {
      addSystemMsg(t('room.joined', { nickname: participant.nickname, lang: participant.language.toUpperCase() }))
    }
    const onParticipantLeft = ({ socketId }: { socketId: string }) => {
      setParticipants(prev => {
        const leaving = prev.find(p => p.socketId === socketId)
        if (leaving) addSystemMsg(t('room.left', { nickname: leaving.nickname }))
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
        const isMine = Boolean(msg.isMine || existing?.isMine)
        return [...filtered, {
          ...msg,
          isMine,
          isTranslating: false,
          deliveryStatus: isMine ? 'delivered' : undefined,
          autoPlay: Boolean(voiceAutoPlayEnabledRef.current && messageHasPlayableAudio({ ...msg, isMine })),
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
      setMessages(prev => {
        const prevById = new Map(prev.map(m => [m.id, m]))
        const historyIds = new Set(history.map(h => h.id))

        // Keep optimistic/in-flight messages that the server hasn't persisted yet.
        // These are messages the sender added locally (sending/queued) or translating
        // placeholders — they'll be replaced properly when message:incoming arrives.
        const inFlight = prev.filter(m =>
          !historyIds.has(m.id) &&
          (m.isTranslating || m.deliveryStatus === 'sending' || m.deliveryStatus === 'queued'),
        )

        const merged = history.map(h => {
          const existing = prevById.get(h.id)
          return {
            ...h,
            originalAudio: h.originalAudio ?? existing?.originalAudio ?? null,
            translatedAudio: h.translatedAudio ?? existing?.translatedAudio ?? null,
            autoPlay: existing?.autoPlay ?? false,
          }
        })

        return [...merged, ...inFlight]
      })
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
    const recoverActiveTab = () => {
      if (document.visibilityState === 'hidden') return

      // Only re-join if the socket actually dropped. When already connected, Socket.IO
      // maintains the session — calling syncRoom redundantly triggers room:history which
      // wipes in-flight optimistic messages that haven't been saved yet.
      if (!socket.connected) {
        setConnectionError('')
        socket.connect()
      }
      markHistoryRead()
    }

    window.addEventListener('focus', recoverActiveTab)
    window.addEventListener('online', recoverActiveTab)
    document.addEventListener('visibilitychange', recoverActiveTab)

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
      window.removeEventListener('focus', recoverActiveTab)
      window.removeEventListener('online', recoverActiveTab)
      document.removeEventListener('visibilitychange', recoverActiveTab)
    }
  }, [addSystemMsg, code, isHost, navigate, nickname, roomName, roomTransport, scrollToBottom, t])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    if (!voiceAlertVisible) return

    const timeout = window.setTimeout(() => {
      setVoiceAlertVisible(false)
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [voiceAlertVisible])

  useEffect(() => {
    if (!isConnected || !roomConfig.input.text) return
    const focusTimer = window.setTimeout(() => textInputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [isConnected, roomConfig.input.text])

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
    const isSolo = roomConfig.mode === 'solo_multilang'
    // In solo mode senderLang = the active speaker side; targetLang = myLanguage (translation target)
    const effectiveSenderLang = isSolo && effectiveSoloLang
      ? effectiveSoloLang
      : myLanguageRef.current
    setMessages(prev => [...prev, {
      id,
      original: text,
      translated: text,
      sender: nickname || t('room.me'),
      senderLang: effectiveSenderLang,
      targetLang: myLanguageRef.current,
      isMine: true,
      timestamp: Date.now(),
      isTranslating: false,
      deliveryStatus: 'sending',
    }])
    if (isSolo) {
      setInputText('')
      void (async () => {
        try {
          const res = await fetch(`/api/solo/rooms/${encodeURIComponent(code)}/text`, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({
              text,
              clientMsgId: id,
              sender: nickname || t('room.me'),
              senderLang: effectiveSenderLang,
              targetLang: myLanguageRef.current,
            }),
          })
          const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: Message }
          if (!res.ok || !data.ok || !data.message) throw new Error('Solo text failed')
          setMessages(prev => prev.map(m =>
            m.id === id
              ? { ...data.message!, deliveryStatus: 'delivered' as const, autoPlay: Boolean(voiceAutoPlayEnabledRef.current && messageHasPlayableAudio(data.message!)) }
              : m
          ))
          setTimeout(scrollToBottom, 100)
        } catch {
          setMessages(prev => prev.map(m => m.id === id ? { ...m, deliveryStatus: 'failed' as const } : m))
        }
      })()
      return
    }
    const socket = socketRef.current
    if (!socket) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, deliveryStatus: 'failed' as const } : m))
      setInputText('')
      return
    }
    socket.timeout(8000).emit(
      'message:text',
      { text, clientMsgId: id, ...(isSolo ? { senderLang: effectiveSenderLang } : {}) },
      (err: Error | null, res?: { ok: boolean; id?: string; error?: string }) => {
        setMessages(prev => prev.map(m => {
          if (m.id !== id) return m
          if (err || !res?.ok) return { ...m, deliveryStatus: 'failed' as const }
          return { ...m, deliveryStatus: 'queued' as const }
        }))
      },
    )
    setInputText('')
  }, [code, inputText, isConnected, nickname, roomConfig.input.text, roomConfig.mode, scrollToBottom, t])

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
      recordingStartedAtRef.current = Date.now()
      setVoiceAlertVisible(false)
      setIsRecording(true)
    } catch {
      alert(t('room.micRequired'))
    }
  }, [roomConfig.input.voice])

  const stopAndSend = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    const durationMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0
    mr.onstop = () => {
      mr.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null
      recordingStartedAtRef.current = 0
      if (durationMs < MIN_VOICE_MESSAGE_DURATION_MS) {
        setVoiceAlertVisible(true)
        return
      }
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        const isSolo = roomConfig.mode === 'solo_multilang'
        const payload: Record<string, unknown> = { audioBase64: base64, mimeType: 'audio/webm', durationMs }
        if (isSolo && soloActiveLangRef.current) {
          const id = crypto.randomUUID()
          const senderLang = soloActiveLangRef.current
          payload.senderLang = senderLang
          setMessages(prev => [...prev, {
            id,
            original: '…',
            translated: '…',
            sender: nickname || t('room.me'),
            senderLang,
            targetLang: myLanguageRef.current,
            isMine: true,
            isAudio: true,
            timestamp: Date.now(),
            isTranslating: true,
            deliveryStatus: 'sending',
          }])
          void (async () => {
            try {
              const res = await fetch(`/api/solo/rooms/${encodeURIComponent(code)}/audio`, {
                method:      'POST',
                credentials: 'include',
                headers:     { 'Content-Type': 'application/json' },
                body:        JSON.stringify({
                  ...payload,
                  sender: nickname || t('room.me'),
                  targetLang: myLanguageRef.current,
                }),
              })
              const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: Message }
              if (!res.ok || !data.ok || !data.message) throw new Error('Solo audio failed')
              setMessages(prev => prev.map(m =>
                m.id === id
                  ? { ...data.message!, deliveryStatus: 'delivered' as const, autoPlay: Boolean(voiceAutoPlayEnabledRef.current && messageHasPlayableAudio(data.message!)) }
                  : m
              ))
              setTimeout(scrollToBottom, 100)
            } catch {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, isTranslating: false, deliveryStatus: 'failed' as const } : m
              ))
            }
          })()
          return
        }
        socketRef.current?.emit('message:audio', payload)
      }
      reader.readAsDataURL(blob)
    }
    mr.stop()
    setIsRecording(false)
  }, [code, nickname, roomConfig.mode, scrollToBottom, t])

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updateRoomConfig = (next: RoomConfig) => {
    setRoomConfig(next)
    if (roomConfig.mode === 'solo_multilang') {
      void (async () => {
        try {
          const res = await fetch(`/api/solo/rooms/${encodeURIComponent(code)}/config`, {
            method:      'PATCH',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ config: next }),
          })
          const data = await res.json().catch(() => ({})) as { ok?: boolean; config?: RoomConfig }
          if (!res.ok || !data.ok) throw new Error('Solo config failed')
          setRoomConfig(data.config ?? next)
        } catch {
          setRoomConfig(roomConfig)
        }
      })()
      return
    }

    const socket = socketRef.current
    if (!socket) {
      setRoomConfig(roomConfig)
      return
    }
    socket.timeout(8000).emit(
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
          <h2 className="text-white text-2xl font-bold">{t('room.gone')}</h2>
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
          <div className="flex items-center gap-2">
            <p className="text-white font-bold text-base truncate">{roomName || code}</p>
            {roomConfig.mode === 'solo_multilang' && (
              <span className="text-xs bg-lt-primary/20 text-lt-primary border border-lt-primary/40 px-2 py-0.5 rounded-full shrink-0">
                Solo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {roomConfig.mode !== 'solo_multilang' && (
              <button onClick={copyCode} className="text-lt-accent text-xs font-mono font-bold hover:opacity-70 transition-opacity">
                {code} {copied ? '✓' : '📋'}
              </button>
            )}
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-lt-accent' : 'bg-yellow-500'}`} />
            <span className="text-lt-muted text-xs">
              {isConnected ? t('room.live') : connectionError || t('room.connecting')}
            </span>
          </div>
        </div>
        {roomConfig.mode !== 'solo_multilang' && (
          <LanguageBadge code={myLanguage} onClick={() => setShowLangPicker(true)} />
        )}
      </div>

      {/* Solo language toggle (replaces participant bar in solo mode) */}
      {roomConfig.mode === 'solo_multilang' && roomConfig.soloLanguages && effectiveSoloLang && (
        <SoloLanguageToggle
          languages={roomConfig.soloLanguages}
          active={effectiveSoloLang}
          onChange={handleSoloToggle}
          disabled={!isConnected}
        />
      )}

      {/* Participants (normal mode only) */}
      {roomConfig.mode !== 'solo_multilang' && participants.length > 0 && (
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

      <div className="flex justify-end px-3 py-2 border-b border-lt-border bg-lt-bg shrink-0">
        <label className="flex items-center gap-2 text-lt-muted text-xs">
          <input
            type="checkbox"
            checked={voiceAutoPlayEnabled}
            onChange={e => updateVoiceAutoPlayEnabled(e.target.checked)}
            aria-label={t('room.autoplayVoice')}
          />
          <span>{t('room.autoplayVoice')}</span>
        </label>
      </div>

      {isHost && (
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-lt-border bg-lt-bg shrink-0">
          <select
            className="bg-lt-card border border-lt-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-lt-primary"
            value={roomConfig.voicePipeline}
            onChange={e => updateRoomConfig({ ...roomConfig, voicePipeline: e.target.value as RoomConfig['voicePipeline'] })}
          >
            <option value="stt-text-translate">STT</option>
            <option value="direct-voice-translation">{t('room.config.directVoice')}</option>
          </select>
          <label className="flex items-center gap-2 text-lt-muted text-xs">
            <input
              type="checkbox"
              checked={roomConfig.output.translatedAudio}
              onChange={e => updateRoomConfig({ ...roomConfig, output: { ...roomConfig.output, translatedAudio: e.target.checked } })}
            />
            <span>{t('room.config.audioOut')}</span>
          </label>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <span className="text-4xl">{roomConfig.mode === 'solo_multilang' ? '🔄' : '🌐'}</span>
            <p className="text-lt-muted text-center text-sm px-8">
              {roomConfig.mode === 'solo_multilang'
                ? t('room.emptyState.solo').split('\n').map((l, i) => <span key={i}>{l}{i === 0 && <br />}</span>)
                : t('room.emptyState.normal').split('\n').map((l, i) => <span key={i}>{l}{i === 0 && <br />}</span>)
              }
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-auto">
            {messages.map(msg =>
              msg.sender === 'system' ? (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-lt-muted text-xs bg-lt-card px-3 py-1 rounded-full">{msg.original}</span>
                </div>
              ) : roomConfig.mode === 'solo_multilang' && roomConfig.soloLanguages ? (
                <SoloMessageBubble
                  key={msg.id}
                  message={msg}
                  soloLanguages={roomConfig.soloLanguages}
                />
              ) : (
                <MessageBubble key={msg.id} message={msg} />
              )
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {voiceAlertVisible && (
        <div className="px-4 pb-3">
          <Alert variant="destructive" className="pr-10">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{t('room.alert.tooShortTitle')}</AlertTitle>
            <AlertDescription>{t('room.alert.tooShortBody')}</AlertDescription>
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-lt-muted transition-colors hover:bg-lt-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lt-primary"
              onClick={() => setVoiceAlertVisible(false)}
              aria-label={t('room.alert.dismiss')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </Alert>
        </div>
      )}

      {/* Input Bar */}
      <div className="flex items-end px-4 py-3 border-t border-lt-border gap-3 shrink-0">
        <textarea
          ref={textInputRef}
          className="flex-1 bg-lt-card border border-lt-border rounded-2xl px-4 py-3 text-white text-base placeholder-lt-muted focus:outline-none focus:border-lt-primary transition-colors resize-none max-h-28"
          placeholder={
            roomConfig.mode === 'solo_multilang' && effectiveSoloLang
              ? `${getLang(effectiveSoloLang).flag} ${t('room.inputPlaceholderSolo', { lang: getLang(effectiveSoloLang).name })}`
              : t('room.inputPlaceholder', { lang: myLanguage.toUpperCase() })
          }
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={!roomConfig.input.text}
        />
        {roomConfig.input.voice && (
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopAndSend}
            onMouseLeave={stopAndSend}
            onTouchStart={startRecording}
            onTouchEnd={stopAndSend}
            disabled={!isConnected || !roomConfig.input.voice}
            title={isRecording ? t('room.stopRecording') : t('room.holdToRecord')}
            aria-label={isRecording ? t('room.stopRecording') : t('room.holdToRecord')}
            className={`rounded-full w-12 h-12 flex items-center justify-center transition-all disabled:opacity-50 shrink-0 ${
              isRecording ? 'bg-lt-danger scale-110' : 'bg-lt-primary hover:bg-lt-primary-dark'
            }`}
          >
            {isRecording ? <Square size={20} className="text-white" fill="currentColor" /> : <Mic size={22} className="text-white" />}
          </button>
        )}
        {roomConfig.input.text && (
          <button
            type="button"
            onClick={sendText}
            disabled={!isConnected || !inputText.trim()}
            title={t('room.sendMessage')}
            aria-label={t('room.sendMessage')}
            className="bg-lt-primary rounded-full w-12 h-12 flex items-center justify-center hover:bg-lt-primary-dark transition-colors disabled:opacity-40 shrink-0"
          >
            <Send size={20} className="text-white" />
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

// ── In-flight translation progress bar ─────────────────────────────────────
// Thin bar shown under an outgoing message while it's being processed:
//   • crawls toward 25% while the server is receiving the message
//   • snaps to 25% once the server has it (status 'queued'), then crawls
//     toward ~92% during translation + audio processing
//   • fills to 100% on delivery, then fades out and unmounts
// Never shows for messages that mount already-delivered (e.g. chat history).
function TranslationProgress({ status, translating, align }: {
  status?: Message['deliveryStatus']
  translating?: boolean
  align?: 'left' | 'right'
}) {
  const inFlight = translating || status === 'sending' || status === 'queued'
  const seenInFlight = useRef(inFlight)
  const [render, setRender] = useState(inFlight)
  const [fading, setFading] = useState(false)
  const [width, setWidth] = useState(12)
  const [durationMs, setDurationMs] = useState(300)

  if (inFlight) seenInFlight.current = true

  useEffect(() => {
    let crawl: ReturnType<typeof setTimeout> | undefined
    let fade: ReturnType<typeof setTimeout> | undefined
    let remove: ReturnType<typeof setTimeout> | undefined

    if (translating) {
      // "…" placeholder (e.g. voice in normal mode, or an incoming translation):
      // crawl toward ~92% and stay there until the real message replaces it.
      setRender(true); setFading(false)
      setDurationMs(280); setWidth(25)
      crawl = setTimeout(() => { setDurationMs(9000); setWidth(92) }, 340)
    } else if (status === 'sending') {
      setRender(true); setFading(false)
      setDurationMs(300); setWidth(12)
      crawl = setTimeout(() => { setDurationMs(9000); setWidth(90) }, 340)
    } else if (status === 'queued') {
      setRender(true); setFading(false)
      setDurationMs(280); setWidth(25)
      crawl = setTimeout(() => { setDurationMs(9000); setWidth(92) }, 340)
    } else if (status === 'delivered' || status === 'read') {
      if (!seenInFlight.current) { setRender(false); return }
      setDurationMs(220); setWidth(100)
      fade = setTimeout(() => setFading(true), 380)
      remove = setTimeout(() => setRender(false), 720)
    } else {
      setRender(false) // 'failed' / undefined
    }

    return () => { clearTimeout(crawl); clearTimeout(fade); clearTimeout(remove) }
  }, [status, translating])

  if (!render) return null

  return (
    <div
      role="progressbar"
      aria-label="Translating"
      className={`mt-1 h-1 w-32 max-w-[55%] overflow-hidden rounded-full bg-white/10 transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      } ${align === 'right' ? 'self-end' : 'self-start'}`}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${width}%`,
          background: 'linear-gradient(90deg, #7C6EFF, #00D4B4)', // lt-primary → lt-accent
          transitionProperty: 'width',
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: 'ease-out',
        }}
      />
    </div>
  )
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

// ── Audio player (WhatsApp-style) ──────────────────────────────────────────

function generateWaveformBars(seed: string, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const envelope = Math.sin((i / (count - 1)) * Math.PI)
    const c = seed.charCodeAt(i % seed.length)
    const noise = Math.abs(Math.sin(i * 1.7 + c * 0.05))
    return 0.15 + envelope * 0.45 + noise * 0.4
  })
}

function AudioPlayer({
  audioBase64,
  mimeType,
  isMine,
  autoPlay,
  onPlaybackError,
}: {
  audioBase64: string;
  mimeType: string;
  isMine: boolean;
  autoPlay?: boolean;
  onPlaybackError?: AudioPlayFailureHandler;
}) {
  const autoPlayAttemptedSrcRef = useRef('')
  const [sharedState, setSharedState] = useState(getSharedAudioSnapshot)
  const [metadataDuration, setMetadataDuration] = useState(0)

  const bars = useMemo(() => generateWaveformBars(audioBase64.slice(0, 40), 36), [audioBase64])
  const src  = useMemo(() => `data:${mimeType};base64,${audioBase64}`, [audioBase64, mimeType])
  const isActiveAudio = sharedState.src === src
  const isPlaying = isActiveAudio && sharedState.isPlaying
  const playbackDuration = isActiveAudio && sharedState.duration > 0 ? sharedState.duration : metadataDuration
  const currentTime = isActiveAudio ? sharedState.currentTime : 0
  const progress = isActiveAudio && playbackDuration > 0 ? Math.min(currentTime / playbackDuration, 1) : 0

  const togglePlay = useCallback(() => {
    const audio = getSharedAudioElement()
    if (isActiveAudio && isPlaying) {
      audio?.pause()
      return
    }

    void playSharedAudioSource({ src, context: 'manual-play', onPlaybackError })
  }, [isActiveAudio, isPlaying, onPlaybackError, src])

  const handleWaveformClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const audio = getSharedAudioElement()
    if (!audio || !isActiveAudio || playbackDuration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * playbackDuration
    emitSharedAudioState()
  }, [isActiveAudio, playbackDuration])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const activeColor   = isMine ? 'rgba(255,255,255,0.92)' : '#7C3AED'
  const inactiveColor = isMine ? 'rgba(255,255,255,0.28)' : 'rgba(124,58,237,0.22)'

  useEffect(() => subscribeSharedAudioState(() => {
    setSharedState(getSharedAudioSnapshot())
  }), [])

  useEffect(() => {
    if (!autoPlay || autoPlayAttemptedSrcRef.current === src) return

    autoPlayAttemptedSrcRef.current = src
    void playSharedAudioSource({ src, context: 'initial-autoplay', onPlaybackError })
  }, [autoPlay, onPlaybackError, src])

  return (
    <div className="flex items-center gap-2 mt-2 min-w-[180px]" onClick={e => e.stopPropagation()}>
      <audio
        src={src}
        preload="metadata"
        aria-hidden="true"
        onError={() => onPlaybackError?.(new Error('Audio source failed to load'))}
        onLoadedMetadata={e => {
          const nextDuration = e.currentTarget.duration
          setMetadataDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80 ${
          isMine ? 'bg-white/20' : 'bg-lt-primary'
        }`}
      >
        {isPlaying
          ? <Pause size={15} fill="white" className="text-white" />
          : <Play  size={15} fill="white" className="text-white ml-0.5" />}
      </button>

      <div className="flex flex-col gap-0.5 flex-1">
        <svg
          height="28"
          viewBox={`0 0 ${bars.length * 5} 28`}
          preserveAspectRatio="none"
          className="w-full cursor-pointer"
          onClick={handleWaveformClick}
        >
          {bars.map((h, i) => {
            const barH = Math.max(3, h * 26)
            return (
              <rect
                key={i}
                x={i * 5 + 1}
                y={(28 - barH) / 2}
                width={3}
                height={barH}
                rx={1.5}
                fill={(i / bars.length) <= progress ? activeColor : inactiveColor}
              />
            )
          })}
        </svg>
        <span className={`text-[10px] leading-none tabular-nums ${isMine ? 'text-white/50' : 'text-lt-muted'}`}>
          {playbackDuration > 0 ? fmt(isPlaying ? currentTime : playbackDuration) : '…'}
        </span>
      </div>
    </div>
  )
}

// ── Solo message bubble ────────────────────────────────────────────────────
// Always shows both original + translation, aligned by which side spoke.

function SoloMessageBubble({ message, soloLanguages }: { message: Message; soloLanguages: [string, string] }) {
  const { senderLang, original, translated, isTranslating, isAudio, originalAudio, translatedAudio, timestamp, deliveryStatus } = message
  const isA = senderLang === soloLanguages[0]
  const senderInfo = getLang(senderLang)
  const targetInfo = getLang(isA ? soloLanguages[1] : soloLanguages[0])
  const time = formatMessageTime(timestamp)
  const hasTranslation = translated !== original

  const canUseOriginalAudio = messageCanUseOriginalAudio(message)
  const playableOriginalAudio = canUseOriginalAudio && isPlayableAudioPayload(originalAudio) ? originalAudio : null
  const playableTranslatedAudio = isPlayableAudioPayload(translatedAudio) ? translatedAudio : null
  const audioToPlay = playableTranslatedAudio ?? playableOriginalAudio ?? null

  if (isTranslating) {
    return (
      <div className={`flex flex-col mb-1 ${isA ? 'items-start' : 'items-end'}`}>
        <div className="max-w-[75%] px-4 py-3 rounded-2xl bg-lt-card border border-lt-border rounded-bl-sm">
          <span className="text-lt-muted text-sm">…</span>
        </div>
        <TranslationProgress translating align={isA ? 'left' : 'right'} />
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isA ? 'items-start' : 'items-end'}`}>
      {/* Original text bubble */}
      <div className={`flex items-center gap-1.5 mb-1 ${isA ? 'ml-1' : 'mr-1'}`}>
        <span className="text-base">{senderInfo.flag}</span>
        <span className="text-lt-muted text-xs">{senderInfo.name}</span>
      </div>
      <div className={`max-w-[78%] px-4 py-3 rounded-2xl ${
        isA ? 'bg-lt-card border border-lt-border rounded-bl-sm' : 'bg-lt-primary rounded-br-sm'
      } ${deliveryStatus === 'failed' ? 'border-lt-danger' : ''}`}>
        {isAudio && (
          <p className={`text-xs mb-1 ${isA ? 'text-lt-muted' : 'text-white/60'}`}>🎤 Voice</p>
        )}
        {audioToPlay && (
          <AudioPlayer
            audioBase64={audioToPlay.audioBase64}
            mimeType={audioToPlay.mimeType}
            isMine={!isA}
            autoPlay={Boolean(message.autoPlay)}
          />
        )}
        <p className="text-white text-base leading-relaxed">{original}</p>
      </div>

      {/* Translation pill */}
      {hasTranslation && (
        <div className={`flex items-center gap-1.5 mt-1.5 max-w-[78%] ${isA ? 'ml-1' : 'mr-1'}`}>
          <span className="text-sm">{targetInfo.flag}</span>
          <p className="text-lt-muted text-sm leading-relaxed italic">{translated}</p>
        </div>
      )}

      <TranslationProgress status={deliveryStatus} align={isA ? 'left' : 'right'} />

      <div className={`flex items-center gap-1 mt-1 mx-1 ${deliveryStatus === 'failed' ? 'text-lt-danger' : 'text-lt-muted'}`}>
        <span className="text-xs">{time}</span>
        {!isA && <DeliveryIcon status={deliveryStatus} />}
      </div>
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const { isMine, sender, senderLang, translated, original, isTranslating, isAudio, originalAudio, translatedAudio, timestamp, deliveryStatus } = message
  const [showOriginal, setShowOriginal] = useState(false)
  const [failedTranslatedAudioKey, setFailedTranslatedAudioKey] = useState('')
  const senderInfo = getLang(senderLang)
  const time = formatMessageTime(timestamp)
  const hasTranslation = translated !== original
  const canUseOriginalAudio = messageCanUseOriginalAudio(message)
  const playableOriginalAudio = canUseOriginalAudio && isPlayableAudioPayload(originalAudio) ? originalAudio : null
  const playableTranslatedAudio = isPlayableAudioPayload(translatedAudio) ? translatedAudio : null
  const translatedAudioKey = playableTranslatedAudio
    ? `${message.id}:${playableTranslatedAudio.mimeType}:${playableTranslatedAudio.audioBase64}`
    : ''
  const useOriginalAudio = Boolean(translatedAudioKey && failedTranslatedAudioKey === translatedAudioKey)
  const audioToPlay = useOriginalAudio ? playableOriginalAudio : (playableTranslatedAudio ?? playableOriginalAudio ?? null)

  const fallbackToOriginalAudio = useCallback(() => {
    if (playableTranslatedAudio && playableOriginalAudio && !useOriginalAudio) {
      setFailedTranslatedAudioKey(translatedAudioKey)
    }
  }, [playableTranslatedAudio, playableOriginalAudio, translatedAudioKey, useOriginalAudio])

  if (isTranslating) {
    return (
      <div className={`flex flex-col mb-1 ${isMine ? 'items-end' : 'items-start'}`}>
        <div className={`max-w-[75%] px-4 py-3 rounded-2xl ${isMine ? 'bg-lt-primary rounded-br-sm' : 'bg-lt-card rounded-bl-sm border border-lt-border'}`}>
          <span className="text-lt-muted text-sm">…</span>
        </div>
        <TranslationProgress translating align={isMine ? 'right' : 'left'} />
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
        {audioToPlay && (
          <AudioPlayer
            audioBase64={audioToPlay.audioBase64}
            mimeType={audioToPlay.mimeType}
            isMine={isMine}
            autoPlay={Boolean(message.autoPlay)}
            onPlaybackError={fallbackToOriginalAudio}
          />
        )}
        <p className={`text-white text-base leading-relaxed ${audioToPlay ? 'mt-2' : ''}`}>
          {showOriginal ? original : translated}
        </p>
        {hasTranslation && (
          <p className={`text-xs mt-1.5 ${isMine ? 'text-white/50' : 'text-lt-muted'}`}>
            {showOriginal ? '↩ show translation' : `${senderInfo.flag} tap to see original`}
          </p>
        )}
      </div>
      {isMine && <TranslationProgress status={deliveryStatus} align="right" />}
      {/* Timestamp + delivery icon (only shown on my messages) */}
      <div className={`flex items-center gap-1 mt-1 mx-1 ${deliveryStatus === 'failed' ? 'text-lt-danger' : 'text-lt-muted'}`}>
        <span className="text-xs">{time}</span>
        {isMine && <DeliveryIcon status={deliveryStatus} />}
      </div>
    </div>
  )
}
