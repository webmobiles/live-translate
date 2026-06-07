# LiveTranslate

Real-time AI translation app with room-based chat — inspired by akkadu.ai.

## Architecture

```
Mobile App (React Native + Expo + NativeWind)
     ↓ Socket.io
Node.js Backend (Express + Socket.io)
     ↓
Translation Gateway (provider pattern)
     ↓
┌─────────┬─────────┬────────┬──────────────┐
│ OpenAI  │  Azure  │ Google │ DeepSeek ... │
│  ✅ now │  stub   │  stub  │   future     │
└─────────┴─────────┴────────┴──────────────┘
```

## Quick Start

### 1. Server

```bash
cd server
npm install
cp .env.example .env          # add your OPENAI_API_KEY
npm run dev
```

Server runs on `http://localhost:4000`

### 2. Mobile

```bash
cd mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_SERVER_URL=http://<your-ip>:4000
npx expo start
```

Scan the QR code with Expo Go (iOS/Android).

> **Note:** Use your local network IP (not `localhost`) in `EXPO_PUBLIC_SERVER_URL` when testing on a real device.

## Room Flow

1. **Create Room** → host selects their language → gets a 6-char code
2. **Share code** → others join and pick their language  
3. **Send messages** (text or voice 🎤) → OpenAI translates live → everyone reads in their own language

## Translation Providers

Set `TRANSLATION_PROVIDER` in server `.env`:

| Value    | Status     | Notes                         |
|----------|------------|-------------------------------|
| `openai` | ✅ Active  | GPT-4o-mini + Whisper STT     |
| `azure`  | 🔧 Stub    | Add credentials to enable     |
| `google` | 🔧 Stub    | Add credentials to enable     |

## Supported Languages

EN · ES · FR · DE · IT · PT · ZH · JA · KO · AR · RU · HI · TR · NL · PL · SV

## Project Structure

```
live-translate/
├── server/
│   ├── src/
│   │   ├── server.js             # Express + Socket.io
│   │   ├── rooms/manager.js      # In-memory room state
│   │   └── gateway/
│   │       ├── index.js          # Provider router
│   │       └── providers/
│   │           ├── openai.js     # GPT-4o-mini + Whisper
│   │           ├── azure.js      # Stub
│   │           └── google.js     # Stub
│   └── package.json
└── mobile/
    ├── app/
    │   ├── _layout.tsx           # Root layout + NativeWind CSS
    │   ├── index.tsx             # Home screen
    │   ├── create.tsx            # Create room
    │   ├── join.tsx              # Join room
    │   └── room/[code].tsx       # Live translation room
    ├── src/
    │   ├── components/
    │   │   ├── MessageBubble.tsx
    │   │   ├── LanguageSelector.tsx
    │   │   ├── ParticipantList.tsx
    │   │   └── VoiceButton.tsx
    │   ├── lib/
    │   │   ├── socket.ts         # Socket.io singleton
    │   │   └── languages.ts      # Language list
    │   └── types/index.ts
    └── package.json
```

## Socket Events

| Direction        | Event                     | Payload                                |
|------------------|---------------------------|----------------------------------------|
| client → server  | `room:create`             | `{ name, nickname, language }`         |
| client → server  | `room:join`               | `{ code, nickname, language }`         |
| client → server  | `message:text`            | `{ text }`                             |
| client → server  | `message:audio`           | `{ audioBase64, mimeType }`            |
| server → client  | `room:participants-updated` | `{ participants }`                   |
| server → client  | `room:participant-joined` | `{ participant }`                      |
| server → client  | `room:participant-left`   | `{ socketId }`                         |
| server → client  | `message:translating`     | `{ id }`                               |
| server → client  | `message:incoming`        | `{ id, original, translated, sender, senderLang, targetLang, isMine, timestamp }` |
