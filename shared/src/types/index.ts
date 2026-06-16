export interface User {
  id: string
  name: string
  nickname: string | null
  email: string | null
  avatar_url: string | null
  mother_language: string | null
  target_language: string | null
}

export interface Participant {
  socketId: string
  nickname: string
  language: string
  isHost: boolean
  joinedAt: number
}

export interface Message {
  id: string
  original: string
  translated: string
  sender: string
  senderLang: string
  targetLang: string
  isMine: boolean
  isAudio?: boolean
  originalAudio?: { audioBase64: string; mimeType: string } | null
  // True when the original audio is recoverable from the server on demand
  // (via GET …/audio/original) rather than shipped inline in originalAudio.
  hasOriginalAudio?: boolean
  translatedAudio?: { audioBase64: string; mimeType: string } | null
  audioPending?: boolean
  ttsStatus?: 'ready' | 'empty' | 'disabled'
  ttsError?: string
  autoPlay?: boolean
  timestamp: number
  isTranslating?: boolean
  deliveryStatus?: 'sending' | 'queued' | 'delivered' | 'read' | 'failed'
  progress?: number
  progressStage?: string
}

export interface RoomConfig {
  mode?: 'normal' | 'solo_multilang'
  soloLanguages?: [string, string] | null
  guestDefaultLanguage?: string | null
  input: { text: boolean; voice: boolean }
  voicePipeline: 'stt-text-translate' | 'direct-voice-translation'
  output: { translatedText: boolean; translatedAudio: boolean }
}

export interface Room {
  code: string
  name: string
  config?: RoomConfig
  participants: Participant[]
  createdAt: number
}
