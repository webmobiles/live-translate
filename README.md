
# LiveTranslate

Real-time AI translation app with room-based chat — inspired by akkadu.ai.

## Architecture

```
Mobile App (React Native + Expo + NativeWind)
Web App    (React + Vite + TanStack Router)
     ↓ Socket.io
Node.js Backend (Express + Socket.io)
     ↓                          ↓
NATS / Redpanda             Inngest (workflows)
pub/sub between servers     AI step orchestration
     ↓                          ↓
          Database provider (ScyllaDB, TiKV via TiDB, or SurrealDB)
```

## Message Flow

```
User sends text message
       ↓
Socket.io receives it
       ↓
NATS ──────────────────────→ all Socket.io servers show spinner
       ↓
Inngest workflow:
  step 1: translate to N languages   — retry 3x if fails
  step 2: save to database           — retry 3x if fails
  step 3: broadcast via queue        — retry 3x if fails
       ↓
All Socket.io servers emit final message to their clients

User sends voice message → same flow but:
  step 1: transcribe audio (Whisper) — retry 3x if fails
  step 2: translate to N languages   — retry 3x if fails
  step 3: save to database           — retry 3x if fails
  step 4: broadcast via queue        — retry 3x if fails
```

---

## Quick Start

### 1. Infrastructure (Docker)

```bash
cd server/tdocker
docker compose up -d
```

| Service | URL | What it is |
|---|---|---|
| NATS Monitoring | http://localhost:8222 | Inspect NATS server health |
| Inngest Dev UI | http://localhost:8288 | Watch AI workflow steps |
| ScyllaDB CQL | localhost:9042 | Database |

Optional observability:

```bash
cd server/tdocker
docker compose --profile observability up -d openobserve
```

OpenObserve runs at `http://localhost:5080` with `root@example.com` / `Complexpass#123`.
Enable local server log and OpenTelemetry export in `server/.env` with `OPENOBSERVE_LOGS_ENABLED=true` and `OTEL_ENABLED=true`.

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
server.ts          → imports only → facades/db, facades/queue, facades/workflows
rooms/manager.ts   → imports only → facades/db
inngest/functions  → imports only → facades/db, facades/queue, facades/translation, facades/stt
```

### Why this matters

If any library changes its API or you want to swap a technology, **you only change one file**:

| Want to change | Only touch |
|---|---|
| ScyllaDB → TiKV/TiDB | `facades/db.ts` + `db/` |
| NATS → Redpanda | `facades/queue.ts` + `nats/` or `kafka/` |
| Inngest → Temporal | `facades/workflows.ts` + `inngest/functions.ts` |
| OpenAI translation → Anthropic | `facades/translation.ts` + `gateway/translation/` |
| OpenAI STT → Vosk/faster-whisper | `facades/stt.ts` + `gateway/stt/` |

Nothing in `server.ts` or `rooms/manager.ts` changes at all.

### Façade files

```
src/facades/
  db.ts          "save message", "get room"    — hides cassandra-driver
  queue.ts       "publish translating"         — hides NATS/kafkajs, subjects/topics
  workflows.ts   "trigger translate workflow"  — hides Inngest events + serve()
  ai.ts          "translate", "transcribe"     — hides OpenAI / Azure / Google
```

### Implementation files (only imported by façades)

```
src/db/scylla.ts              cassandra-driver implementation
src/kafka/index.ts            kafkajs implementation
src/inngest/client.ts         Inngest client singleton
src/inngest/functions.ts      Inngest workflow functions
src/gateway/index.ts          Backward-compatible AI router
src/gateway/translation/      Text translation providers
src/gateway/stt/              Speech-to-text providers
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
│   ├── tdocker/
│   │   └── docker-compose.yml        # Local infrastructure
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts                 # Express + Socket.io entry point
│       ├── facades/
│       │   ├── db.ts                 # Database façade
│       │   ├── queue.ts              # Message queue façade
│       │   ├── workflows.ts          # Inngest workflow façade
│       │   ├── translation.ts        # Translation provider façade
│       │   └── stt.ts                # Speech-to-text provider façade
│       ├── db/
│       │   ├── scylla.ts             # ScyllaDB / cassandra-driver
│       │   ├── tikv.ts               # TiKV through TiDB SQL / mysql2
│       │   └── surreal.ts            # SurrealDB / surrealdb SDK
│       ├── kafka/
│       │   └── index.ts              # Redpanda / kafkajs
│       ├── nats/
│       │   └── index.ts              # NATS message bus
│       ├── inngest/
│       │   ├── client.ts             # Inngest client
│       │   └── functions.ts          # translate + transcribe workflows
│       ├── rooms/
│       │   └── manager.ts            # In-memory participant state
│       └── gateway/
│           ├── index.ts              # Backward-compatible AI router
│           ├── translation/          # Text translation gateway
│           ├── stt/                  # Speech-to-text gateway
│           └── providers/            # Legacy/shared providers
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
| `openai` | ✅ Active | GPT-4o-mini text translation |
| `mock` | ✅ Local dev | No external API calls; prefixes text with the target language |
| `azure` | 🔧 Stub | Add credentials to enable |
| `google` | 🔧 Stub | Add credentials to enable |

Set `FORCE_AI_TRANSLATION=true` to use OpenAI even when `TRANSLATION_PROVIDER=mock`.

## Speech-To-Text Providers

Set `STT_PROVIDER` in server `.env`:

| Value | Status | Notes |
|---|---|---|
| `openai` | ✅ Active | Uses OpenAI Whisper API |
| `mock` | ✅ Local dev | Returns `Mock transcription` |
| `faster-whisper` | ⚙️ Local command | Runs `FASTER_WHISPER_COMMAND`; install/configure it on the host |
| `vosk` | ⚙️ Local command | Runs `VOSK_COMMAND`; install/configure it on the host |

Local command providers receive the audio as a temporary file. Override args with placeholders:

```env
STT_PROVIDER=faster-whisper
FASTER_WHISPER_COMMAND=faster-whisper
FASTER_WHISPER_MODEL=small
# FASTER_WHISPER_ARGS={file} --model {model} --language {language}

STT_PROVIDER=vosk
VOSK_COMMAND=vosk-transcribe
VOSK_MODEL_PATH=./models/vosk-fr
# VOSK_ARGS={file} --model {model} --language {language}
```

## Room Media Modes

Rooms store media config when created and hosts can update it inside the room:

```js
{
  input: { text: true, voice: true },
  voicePipeline: 'stt-text-translate',
  output: { translatedText: true, translatedAudio: false }
}
```

Audio messages can use either `stt-text-translate` or `direct-voice-translation`. The direct path is a separate gateway because realtime speech translation is not the same as batch transcription.

## Text-To-Speech Providers

Set `TTS_PROVIDER` in server `.env`:

| Value | Status | Notes |
|---|---|---|
| `none` | ✅ Default | No translated audio output |
| `mock` | ✅ Local dev | Emits text/plain base64 payloads |
| `openai` | ✅ Active | Uses OpenAI speech generation |
| `local` | ⚙️ Local command | Runs `LOCAL_TTS_COMMAND`; command prints base64 audio |

```env
TTS_PROVIDER=openai
TTS_OPENAI_MODEL=gpt-4o-mini-tts
TTS_OPENAI_VOICE=coral
TTS_RESPONSE_FORMAT=mp3
```

For local TTS:

```env
TTS_PROVIDER=local
LOCAL_TTS_COMMAND=my-tts-command
# LOCAL_TTS_ARGS=--text {text} --language {language} --voice {voice}
LOCAL_TTS_MIME_TYPE=audio/wav
```

## Direct Voice Translation Providers

Set `VOICE_TRANSLATION_PROVIDER` in server `.env`:

| Value | Status | Notes |
|---|---|---|
| `none` | ✅ Default | Direct voice translation disabled |
| `mock` | ✅ Local dev | Returns mock translated text |
| `openai-realtime` | 🚧 Streaming path needed | Requires a Realtime session, not the current batch Inngest workflow |

This setting is about the AI voice pipeline only. It decides how an audio message could be translated directly from speech to speech/text.

The current normal audio flow is still:

```text
audio message
  -> speech-to-text provider, controlled by STT_PROVIDER
  -> text translation provider, controlled by TRANSLATION_PROVIDER
  -> optional text-to-speech provider, controlled by TTS_PROVIDER
```

`VOICE_TRANSLATION_PROVIDER=openai-realtime` is reserved for a direct streaming OpenAI Realtime API path. That is different from Dragonfly, Valkey, Redis, NATS, or Redpanda. Those are infrastructure services; they do not translate audio.

## Database Providers

Set `DB_PROVIDER` in server `.env`:

| Value | Status | Notes |
|---|---|---|
| `scylla` | ✅ Default | Uses ScyllaDB/Cassandra CQL on `SCYLLA_HOSTS` |
| `tikv` | ✅ TiKV via TiDB | Uses TiDB's MySQL-compatible SQL layer backed by TiKV |
| `surreal` | ✅ SurrealDB | Uses SurrealDB over HTTP/WebSocket RPC |

For TiKV mode, run a TiDB cluster and configure:

```env
DB_PROVIDER=tikv
TIKV_SQL_HOST=localhost
TIKV_SQL_PORT=14000
TIKV_SQL_USER=root
TIKV_SQL_PASSWORD=
TIKV_SQL_DATABASE=live_translate
```

For local Docker TiKV/TiDB:

```bash
cd server
docker compose -f tdocker/docker-compose.yml --profile tikv up -d pd tikv tidb
```

For local Docker SurrealDB:

```bash
cd server
docker compose -f tdocker/docker-compose.yml --profile surreal up -d surrealdb
```

Then configure:

```env
DB_PROVIDER=surreal
SURREALDB_URL=http://localhost:8000/rpc
SURREALDB_NAMESPACE=live_translate
SURREALDB_DATABASE=live_translate
SURREALDB_USERNAME=root
SURREALDB_PASSWORD=root
```

## Socket.IO Realtime Adapter

This section is about live Socket.IO event coordination, not OpenAI Realtime translation.

`REALTIME_PROVIDER` controls how Socket.IO servers share room events when you run more than one backend process. It is infrastructure for the chat transport: joins, leaves, typing/message events, and broadcasts between server instances.

It does not choose the AI translation provider. It does not call OpenAI. It does not perform speech translation.

For one Socket.IO server, keep:

```env
REALTIME_PROVIDER=none
```

With `none`, Socket.IO uses only in-memory state inside the current Node process. This is fine for local development and a single backend instance.

For multiple Socket.IO servers, choose one Redis-compatible adapter:

```env
REALTIME_PROVIDER=dragonfly
DRAGONFLY_URL=redis://localhost:6379
```

or:

```env
REALTIME_PROVIDER=valkey
VALKEY_URL=redis://localhost:6380
```

Both Dragonfly and Valkey are Redis-compatible servers. The backend connects to them through `@socket.io/redis-adapter`, so a socket event emitted by one backend instance can reach clients connected to another backend instance.

The startup health check prints this as `Realtime` because it is checking the Socket.IO realtime adapter. If it fails with a message like:

```text
Realtime provider check timed out after 8000ms
```

it means the configured Redis-compatible adapter is not reachable. For `REALTIME_PROVIDER=dragonfly`, check that Dragonfly is running and that `DRAGONFLY_URL` points to the right host and port.

### Realtime Naming Cheat Sheet

| Setting / name | Meaning | Example values | Related to OpenAI Realtime? |
|---|---|---|---|
| `REALTIME_PROVIDER` | Socket.IO adapter for sharing live events across backend instances | `none`, `dragonfly`, `valkey` | No |
| `DRAGONFLY_URL` / `VALKEY_URL` | Connection URL for the Redis-compatible Socket.IO adapter | `redis://localhost:6379` | No |
| `VOICE_TRANSLATION_PROVIDER` | Direct voice translation provider | `none`, `mock`, `openai-realtime` | Yes, only when set to `openai-realtime` |
| `TRANSLATION_PROVIDER` | Text translation provider | `openai`, `mock`, `azure`, `google` | Uses OpenAI only when set to `openai` |

## Supported Languages

EN · ES · FR · DE · IT · PT · ZH · JA · KO · AR · RU · HI · TR · NL · PL · SV
