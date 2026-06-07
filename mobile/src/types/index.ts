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
  timestamp: number;
  isTranslating?: boolean;
}

export interface Room {
  code: string;
  name: string;
  participants: Participant[];
  createdAt: number;
}
