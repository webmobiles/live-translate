
# LiveTranslate

Real-time AI translation app with room-based chat — inspired by akkadu.ai.

## Architecture

```
Mobile App (React Native + Expo + NativeWind)
Web App    (React + Vite + TanStack Router)
     ↓ Socket.io
Node.js Backend (Express + Socket.io)
     ↓                          ↓
Redpanda (Kafka)            Inngest (workflows)
pub/sub between servers     AI step orchestration
     ↓                          ↓
          ScyllaDB (permanent chat history)
```

## Message Flow

```
User sends text message
       ↓
Socket.io receives it
       ↓
Redpanda ──────────────────→ all Socket.io servers show spinner
       ↓
Inngest workflow:
  step 1: translate to N languages   — retry 3x if fails
  step 2: save to ScyllaDB           — retry 3x if fails
  step 3: broadcast via Redpanda     — retry 3x if fails
       ↓
All Socket.io servers emit final message to their clients

User sends voice message → same flow but:
  step 1: transcribe audio (Whisper) — retry 3x if fails
  step 2: translate to N languages   — retry 3x if fails
  step 3: save to ScyllaDB           — retry 3x if fails
  step 4: broadcast via Redpanda     — retry 3x if fails
```

---

## Quick Start

### 1. Infrastructure (Docker)

```bash
cd server
docker compose -f docker/docker-compose.yml up -d
```

| Service | URL | What it is |
|---|---|---|
| Redpanda Console | http://localhost:8080 | Inspect Kafka topics |
| Inngest Dev UI | http://localhost:8288 | Watch AI workflow steps |
| ScyllaDB CQL | localhost:9042 | Database |

### 2. Server

```bash
cd server
npm install
cp .env.example .env    # add your OPENAI_API_KEY
npm run dev
```

In a second terminal start the Inngest dev runner:
```bash
INNGEST_DEV=1 npx inngest-cli@latest dev -u http://localhost:4000/api/inngest
```

Server runs on `http://localhost:4000`

### 3. Web

```bash
cd web
npm install
npm run dev
```

Web app runs on `http://localhost:5173`

### 4. Mobile

```bash
cd mobile
npm install
cp .env.example .env    # set EXPO_PUBLIC_SERVER_URL=http://<your-ip>:4000
npx expo start
```

Scan the QR code with Expo Go (iOS/Android).

> **Note:** Use your local network IP (not `localhost`) for mobile device testing.

---

## Server Architecture — Façade Pattern

The server uses the **Façade pattern** to isolate all external library calls behind a single point of access per technology. Business logic never imports `kafkajs`, `cassandra-driver`, or `inngest` directly — only the façades do.

```
server.js          → imports only → facades/db, facades/queue, facades/workflows
rooms/manager.js   → imports only → facades/db
inngest/functions  → imports only → facades/db, facades/queue, facades/ai
```

### Why this matters

If any library changes its API or you want to swap a technology, **you only change one file**:

| Want to change | Only touch |
|---|---|
| ScyllaDB → Postgres | `facades/db.js` + `db/scylla.js` |
| Redpanda → NATS | `facades/queue.js` + `kafka/index.js` |
| Inngest → Temporal | `facades/workflows.js` + `inngest/functions.js` |
| OpenAI → Anthropic | `facades/ai.js` + `gateway/providers/` |

Nothing in `server.js` or `rooms/manager.js` changes at all.

### Façade files

```
src/facades/
  db.js          "save message", "get room"    — hides cassandra-driver
  queue.js       "publish translating"         — hides kafkajs, topic names
  workflows.js   "trigger translate workflow"  — hides Inngest events + serve()
  ai.js          "translate", "transcribe"     — hides OpenAI / Azure / Google
```

### Implementation files (only imported by façades)

```
src/db/scylla.js              cassandra-driver implementation
src/kafka/index.js            kafkajs implementation
src/inngest/client.js         Inngest client singleton
src/inngest/functions.js      Inngest workflow functions
src/gateway/index.js          AI provider router
src/gateway/providers/        openai.js, azure.js, google.js
```

---

## Project Structure

```
live-translate/
├── web/
│   └── src/
│       ├── routes/
│       │   ├── index.tsx             # Home — Create / Join buttons
│       │   ├── create.tsx            # Create room form
│       │   ├── join.tsx              # Join room form
│       │   └── room.$code.tsx        # Live chat room
│       ├── components/
│       │   └── LanguageSelector.tsx  # Language picker + badge
│       ├── lib/
│       │   ├── socket.ts             # Socket.io singleton
│       │   └── languages.ts          # Language list
│       └── types/index.ts
│
├── server/
│   ├── docker/
│   │   └── docker-compose.yml        # Redpanda + ScyllaDB + Inngest
│   └── src/
│       ├── server.js                 # Express + Socket.io entry point
│       ├── facades/
│       │   ├── db.js                 # Database façade
│       │   ├── queue.js              # Message queue façade
│       │   ├── workflows.js          # Inngest workflow façade
│       │   └── ai.js                 # AI provider façade
│       ├── db/
│       │   └── scylla.js             # ScyllaDB / cassandra-driver
│       ├── kafka/
│       │   └── index.js              # Redpanda / kafkajs
│       ├── inngest/
│       │   ├── client.js             # Inngest client
│       │   └── functions.js          # translate + transcribe workflows
│       ├── rooms/
│       │   └── manager.js            # In-memory participant state
│       └── gateway/
│           ├── index.js              # Provider router
│           └── providers/
│               ├── openai.js         # GPT-4o-mini + Whisper ✅
│               ├── azure.js          # Stub
│               └── google.js         # Stub
│
└── mobile/
    ├── app/
    │   ├── index.tsx                 # Home screen
    │   ├── create.tsx                # Create room
    │   ├── join.tsx                  # Join room
    │   └── room/[code].tsx           # Live translation room
    └── src/
        ├── components/
        │   ├── MessageBubble.tsx
        │   ├── LanguageSelector.tsx
        │   ├── ParticipantList.tsx
        │   └── VoiceButton.tsx
        └── lib/
            ├── socket.ts
            └── languages.ts
```

---

## Room Flow

1. **Create Room** → host picks their language → gets a 6-char code (e.g. `ABC123`)
2. **Share code** → others join and pick their own language
3. **Send messages** (text or voice 🎤) → AI translates live → everyone reads in their language
4. **History** → messages are permanently stored in ScyllaDB — rejoin anytime and see the full history

---

## Socket Events

| Direction | Event | Payload |
|---|---|---|
| client → server | `room:create` | `{ name, nickname, language }` |
| client → server | `room:join` | `{ code, nickname, language }` |
| client → server | `room:update-language` | `{ language }` |
| client → server | `message:text` | `{ text }` |
| client → server | `message:audio` | `{ audioBase64, mimeType }` |
| server → client | `room:history` | `{ messages[] }` |
| server → client | `room:participants-updated` | `{ participants[] }` |
| server → client | `room:participant-joined` | `{ participant }` |
| server → client | `room:participant-left` | `{ socketId }` |
| server → client | `message:translating` | `{ id }` |
| server → client | `message:incoming` | `{ id, original, translated, sender, senderLang, targetLang, isMine, isAudio, timestamp }` |

---

## Translation Providers

Set `TRANSLATION_PROVIDER` in server `.env`:

| Value | Status | Notes |
|---|---|---|
| `openai` | ✅ Active | GPT-4o-mini + Whisper STT |
| `mock` | ✅ Local dev | No external API calls; prefixes text with the target language |
| `azure` | 🔧 Stub | Add credentials to enable |
| `google` | 🔧 Stub | Add credentials to enable |

## Supported Languages

EN · ES · FR · DE · IT · PT · ZH · JA · KO · AR · RU · HI · TR · NL · PL · SV
