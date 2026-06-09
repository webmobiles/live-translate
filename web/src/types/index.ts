export interface Participant {
  socketId: string;
  nickname: string;
  language: string;
  isHost: boolean;
  joinedAt: number;
}

export interface Message {
  id: string;
  original: string;
  translated: string;
  sender: string;
  senderLang: string;
  targetLang: string;
  isMine: boolean;
  isAudio?: boolean;
  translatedAudio?: {
    audioBase64: string;
    mimeType: string;
  } | null;
  timestamp: number;
  isTranslating?: boolean;
  deliveryStatus?: 'sending' | 'queued' | 'delivered' | 'read' | 'failed';
}

export interface RoomConfig {
  input: {
    text: boolean;
    voice: boolean;
  };
  voicePipeline: 'stt-text-translate' | 'direct-voice-translation';
  output: {
    translatedText: boolean;
    translatedAudio: boolean;
  };
}

export interface Room {
  code: string;
  name: string;
  config?: RoomConfig;
  participants: Participant[];
  createdAt: number;
}
