
# LiveTranslate

Real-time AI translation app with room-based chat — inspired by akkadu.ai.

## Architecture

```
Phone App  (Flutter / Dart)
Web App    (React + Vite + TanStack Router)
     ↓ Socket.io / HTTP
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

## Audio Payload and Autoplay Rules

This part is easy to break accidentally. Keep the server and web client rules aligned.

### Audio payload names

`translatedAudio` is generated TTS for one participant's configured language. It must come from:

```ts
message.audioOutputs?.[participant.language] ?? null
```

Do not fall back to `message.audioOutputs?.[message.senderLang]` for guests. That makes a guest hear the sender's language instead of the language they selected when joining the room.

`originalAudio` is the raw recording sent by the speaker. It is allowed only when the listener can understand the sender language:

```ts
const isSender = participant.socketId === message.senderSocketId
const canUseOriginalAudio = isSender || participant.language === message.senderLang
```

So the server should emit:

```ts
originalAudio: canUseOriginalAudio ? (message.originalAudio ?? null) : null
translatedAudio: message.audioOutputs?.[participant.language] ?? null
```

This means:

| Listener | `translatedAudio` | `originalAudio` |
|---|---|---|
| Sender | Usually none, because we do not synthesize TTS in the sender's own language | Allowed for voice messages |
| Guest with same language as sender | Their language audio if generated | Allowed |
| Guest with different language | Their language audio if generated | Not allowed |

If translated TTS is missing for a guest with a different language, play no audio. Do not play the original recording as a fallback, because that is the wrong language for that guest.

### TTS target language and voice selection

The TTS target language is not an `.env` setting. It comes from the receiver's room/join language:

```ts
const text = translations[lang]
return [lang, await tts.synthesize(text, lang)]
```

In this code, `lang` is the receiver target language, e.g. `es` for a guest who joined in Spanish. TTS providers must use that runtime language for pronunciation or voice selection. Do not replace it with `senderLang`, `TTS_OPENAI_VOICE`, `KOKORO_VOICE`, or another static env value.

Provider env vars choose provider-level behavior only:

| Env var | Meaning |
|---|---|
| `TTS_PROVIDER` | Which TTS backend to use |
| `TTS_RESPONSE_FORMAT` | Audio format such as `mp3` or `wav` |
| `TTS_OPENAI_VOICE` | OpenAI voice style, while language still comes from `lang` |
| `KOKORO_VOICE` | Optional English Kokoro voice override only; do not use it as the receiver language |

For Kokoro, the default voice is selected from the receiver language map first:

| Receiver `lang` | Default Kokoro voice |
|---|---|
| `en` | `af_heart` |
| `es` | `ef_dora` |
| `fr` | `ff_siwis` |
| `hi` | `hf_alpha` |
| `it` | `if_sara` |
| `ja` | `jf_alpha` |
| `pt` | `pf_dora` |
| `zh` | `zf_xiaobei` |

Example: if the sender speaks English and the receiver joined with Spanish, the workflow translates to Spanish and calls `tts.synthesize(spanishText, 'es')`. Kokoro should then use `ef_dora`, not the English fallback `af_heart`.

Kokoro must return no TTS audio for languages that are not in this map. Do not fall back to English for unsupported languages such as German (`de`), Korean (`ko`), Arabic (`ar`), Russian (`ru`), Turkish (`tr`), Dutch (`nl`), Polish (`pl`), or Swedish (`sv`). `KOKORO_VOICE` may override the English voice only; it must not be used as a fallback voice for unsupported receiver languages. If those languages need spoken output, use `TTS_PROVIDER=openai` or a `local` TTS command that supports the target language.

### Frontend playback choice

The web client uses the same rule before rendering or autoplaying audio:

```ts
message.isMine || message.targetLang === message.senderLang
```

Only then can it use `originalAudio`. Otherwise it must use only `translatedAudio`.

The bubble chooses audio in this order:

1. Use playable `translatedAudio`.
2. If translated audio fails and original audio is allowed, use playable `originalAudio`.
3. If neither is available, show text only.

### Autoplay rules

Autoplay is a local browser-window preference. Every room window starts with **Autoplay voice** checked. If the participant unchecks it, new audio messages keep the play component but require manual play.

Autoplay must be based on actual playable audio payloads, not only on `isAudio`:

```ts
isPlayableAudioPayload(message.translatedAudio)
  || (messageCanUseOriginalAudio(message) && isPlayableAudioPayload(message.originalAudio))
```

Why: typed text messages can have generated TTS audio even when `isAudio` is false, and voice messages can lack translated TTS but still have allowed original audio for the sender.

The web client reuses one shared audio element for autoplay. This improves browser autoplay behavior after a user gesture. Browsers can still block sound until the user interacts with the page; in that case playback is queued and retried on the next click, touch, or key press.

### Regression guardrails

- Do not send sender-language `translatedAudio` to guests as a fallback.
- Do not send `originalAudio` to guests whose language differs from `senderLang`.
- Do not put the target TTS language in `.env`; use the receiver `lang` passed to `tts.synthesize(text, lang)`.
- Do not make autoplay depend only on `isAudio`.
- Do not replace the audio player with text after playback; the audio component should remain visible.
- If you patch `server/src/server.ts` and the app is running from `dist`, patch `server/dist/server.js` too or rebuild intentionally.

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

Optional Grafana observability:

```bash
cd server/tdocker
docker compose --profile grafana up -d grafana loki tempo prometheus otel-collector
```

Grafana runs at `http://localhost:3001` with `admin` / `admin`.
The server sends Pino logs to Loki and OpenTelemetry traces/metrics to the local OpenTelemetry Collector.

### 2. Server

```bash
cd server
npm install
cp .env.example .env    # add your OPENAI_API_KEY and Google OAuth credentials (see below)
npm run dev
```

#### Google OAuth setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. **Create credentials → OAuth 2.0 Client ID** → Application type: **Web application**
3. Under **Authorized redirect URIs** add: `http://localhost:4000/auth/google/callback`
4. Copy the credentials into your `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-here
```

> The server starts without these values (Google login is disabled with a warning). Set them when you are ready to enable authentication.

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

### 4. Phone (Flutter)

```bash
cd phone
flutter pub get
cp .env.example .env    # edit SERVER_URL=http://<your-ip>:4000
flutter run
```

> **Note:** Use your local network IP (not `localhost`) for mobile device testing. On Apple Silicon, run `brew install cocoapods && cd ios && pod install` before building for iOS.

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

```md
live-translate/
├── web/
│   └── src/
│       ├── routes/
│       │   ├── index.tsx             # Home — Create / Join buttons
│       │   ├── create.tsx            # Create room form (normal + solo)
│       │   ├── join.tsx              # Join room form
│       │   ├── settings.tsx          # User settings (language, nickname)
│       │   └── room.$code.tsx        # Live chat room (normal + solo modes)
│       ├── components/
│       │   ├── LanguageSelector.tsx  # Language picker + badge
│       │   └── SoloLanguageToggle.tsx # Solo mode A⇄B language switch
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
│       ├── facades/                  # Façade pattern isolation layer
│       ├── db/                       # Database implementations
│       ├── nats/ / kafka/            # Message queue implementations
│       ├── inngest/                  # AI workflow orchestration
│       ├── rooms/                    # Room state & participant manager
│       └── gateway/                  # AI providers (translation, STT, TTS)
│
├── phone/
│   └── lib/
│       ├── screens/
│       │   ├── home_screen.dart      # Home + Google OAuth
│       │   ├── create_screen.dart    # Create room (normal + solo)
│       │   ├── join_screen.dart      # Join by code
│       │   ├── room_screen.dart      # Live chat room (normal + solo)
│       │   └── settings_screen.dart  # User prefs (language, avatar)
│       ├── widgets/
│       │   ├── message_bubble.dart   # Chat message display
│       │   ├── language_selector.dart # Language picker bottom sheet
│       │   ├── participant_list.dart # Room participant bar
│       │   └── voice_button.dart     # Press & hold voice recorder
│       ├── services/
│       │   ├── socket_service.dart   # Socket.io client
│       │   ├── solo_api.dart         # HTTP API client for solo rooms
│       │   ├── auth_service.dart     # Google OAuth
│       │   └── user_prefs.dart       # Local settings persistence
│       ├── models/                   # Data classes (Message, Participant, etc.)
│       ├── state/                    # Global app state management
│       └── theme.dart               # App-wide theming
│
└── shared/
    └── src/
        ├── types/index.ts            # Shared TypeScript types
        ├── lib/socket-events.ts      # Socket event name constants
        └── locales/                  # i18n translation JSON (6 languages)
```

---

## Feature Compatibility: Web ↔ Phone

The web (`./web`) and phone (`./phone`) apps share the same backend and implement the same room-based translation flow. The table below tracks every feature and version differences — treat it as a living checklist. When you add a feature to one platform, update the table and raise the compatibility score.

| # | Feature | Web | Phone | Notes |
|---|---------|:---:|:-----:|-------|
| 1 | Room creation (normal mode) | ✅ | ✅ | Both use socket.io `room:create` |
| 2 | Room creation (solo mode) | ✅ | ✅ | Web: HTTP or socket (env `WEB_SOLOROOM_SOCKET=yes`). Phone: HTTP or socket (dart define `PHONE_SOLOROOM_SOCKET=yes`) |
| 3 | Room join by code (normal) | ✅ | ✅ | Socket.io `room:join` + code peek for guest language |
| 4 | Solo room — double-language toggle UI | ✅ | ❌ | Web: `SoloLanguageToggle` A⇄B with equal-size source bubbles and consistent green translated-result bubbles for text/audio. Phone: fallback to first language only |
| 5 | Text message send (normal) | ✅ | ✅ | Socket.io `message:text` with ack; same-language receivers keep original text and can still receive generated audio |
| 6 | Text message send (solo) | ✅ | ✅ | Web and Phone: HTTP or socket; socket solo sends translated audio back to the same room socket |
| 7 | Voice message send (normal) | ✅ | ✅ | Press & hold mic → socket `message:audio` |
| 8 | Voice message send (solo) | ✅ | ✅ | Web and Phone: HTTP or socket |
| 9 | Translation spinner while in-flight | ✅ | ✅ | Web: progress bar + delivery icons + instant mic placeholder with fake waveform + audio client stages (`preparing audio`, `encoding audio`, `sending audio`) + server-confirmed stage labels (`received`, `transcribing`, `translating`, `generating audio`, `saving`, `delivering`). Phone: ActivityIndicator only |
| 10 | Delivery status icons (sending / queued / delivered / read / failed) | ✅ | ❌ | Web: WhatsApp-style checkmarks. Phone: not tracked |
| 11 | Message bubble — tap to toggle original / translation | ✅ | ❌ | Web only. Phone shows both simultaneously |
| 12 | Audio autoplay with shared player element | ✅ | ❌ | Web: unified Audio element, queued retry, gesture unlock |
| 13 | Audio waveform visualization | ✅ | ❌ | Web: SVG waveform with seek, play/pause, duration |
| 14 | Audio playback fallback (translated → original on error) | ✅ | ❌ | Web: falls back to `originalAudio` when TTS fails |
| 15 | Voice autoplay toggle (host checkbox) | ✅ | ❌ | Web: checkbox in room header |
| 16 | Room config edit in-room (voice pipeline, audio output) | ✅ | ❌ | Web: host can toggle STT/direct-voice and TTS audio from inside the room |
| 17 | System messages (join / left / reconnect) | ✅ | ✅ | Both platforms |
| 18 | Participant list with language badges | ✅ | ✅ | Web: tailwind chips. Phone: horizontal scroll |
| 19 | Language picker | ✅ | ✅ | Web: modal with search. Phone: bottom sheet with flag+name |
| 20 | Copy room code to clipboard | ✅ | ✅ | Both platforms |
| 21 | Room lost auto-redirect with countdown | ✅ | ❌ | Web: 4-second countdown → home. Phone: not implemented |
| 22 | Reconnection handling | ✅ | ✅ | Web: socket reconnect + room re-sync; backend restart keeps users in-room with disconnected/reconnected system text instead of redirecting to login. Phone: socket.io reconnection |
| 23 | Chat history loading on join | ✅ | ✅ | Web: HTTP `GET /api/rooms/:code`. Phone: normal mode via socket, solo via HTTP |
| 24 | Solo message retry on failure | ❌ | ✅ | Phone: one-tap retry via `_RetryPayload` map |
| 25 | Composer placeholder with flag + language name | ✅ | ❌ | Web: `🇫🇷 French` in input placeholder |
| 26 | Google OAuth login | ✅ | ✅ | Both platforms |
| 27 | Onboarding flow | ✅ | ❌ | Web only |
| 28 | UI language (i18n, 6 locales) | ✅ | ✅ | Both use shared `shared/locales/` JSONs |
| 29 | Settings / user preferences | ✅ | ✅ | Both: nickname, mother/target language, avatar |
| 30 | Auth-required mode (`REQUIRE_AUTH=true`) | ❌ | ✅ | Phone: enforcement in `config.dart`. Web: no forced auth |
| 31 | Markdown formatting in translated messages | ✅ | ❌ | Web: renders bold/italic. Phone: plain text only |

**Compatibility score: ~58%** *(18 of 31 features identical, tracked as of 2026-06-15)*

The score counts features that work identically on both platforms (✅✅). Features with partial overlap or platform-specific behavior are not counted. Update the score when you close gaps.

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
| server → client | `message:incoming` | `{ id, original, translated, sender, senderLang, targetLang, isMine, isAudio, originalAudio, translatedAudio, timestamp }` |

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
| `kokoro` | ⚙️ Local HTTP | Kokoro server — en/es/fr/hi/it/ja/pt/zh |
| `piper` | ⚙️ Local HTTP | Piper server — ar/cs/de/fi/hu/nl/pl/ro/ru/sv/tr/uk |
| `hybrid` | ⚙️ Local HTTP | Kokoro first, Piper fallback — full language coverage |

```env
TTS_PROVIDER=openai
TTS_OPENAI_MODEL=gpt-4o-mini-tts
TTS_OPENAI_VOICE=coral
TTS_RESPONSE_FORMAT=mp3
```

### Kokoro TTS (local, offline)

High-quality neural TTS for: en, es, fr, hi, it, ja, pt, zh.

```env
TTS_PROVIDER=kokoro
KOKORO_BASE_URL=http://localhost:8880
KOKORO_VOICE=af_heart
```

Start the container (no extra setup needed — model is bundled):

```bash
cd server/tdocker
docker-compose --profile local-tts up -d kokoro
```

Kokoro chooses the voice from the receiver's target language at runtime. `KOKORO_VOICE` only overrides the English voice. For unsupported languages (de, ru, nl, etc.) Kokoro returns no audio — use `piper` or `hybrid` to cover those.

### Piper TTS (local, offline — extra languages)

Fast neural TTS for languages Kokoro doesn't support: ar, cs, de, fi, hu, ko, nl, pl, ro, ru, sv, tr, uk.

1. Download voice models (run once, ~600 MB total):

```bash
cd server
./tdocker/install-piper-voices.sh
```

2. Build and start the container:

```bash
cd server/tdocker
docker-compose --profile local-tts up -d --build piper
```

3. Set in `.env`:

```env
TTS_PROVIDER=piper
PIPER_BASE_URL=http://localhost:8881
```

Voice models are stored in `server/data/piper/models/` and mounted into the container. Run the install script again at any time to add more voices — it skips files already downloaded.

### Hybrid TTS (Kokoro + Piper, recommended)

Routes each language to the best available backend: Kokoro for its eight languages, Piper for everything else.

1. Download Piper voice models:

```bash
cd server
./tdocker/install-piper-voices.sh
```

2. Start both containers:

```bash
cd server/tdocker
docker-compose --profile local-tts up -d --build kokoro piper
```

3. Set in `.env`:

```env
TTS_PROVIDER=hybrid
KOKORO_BASE_URL=http://localhost:8880
PIPER_BASE_URL=http://localhost:8881
```

### Local TTS command

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

## Observability — Log Levels and Severity

Logs carry two independent fields so you can filter by technical detail **and** by urgency separately.

### Log level — what happened technically

| Level | When to use |
|---|---|
| `info` | Normal operations — room created, user joined, message sent. Useful history, no action needed. |
| `warn` | Something degraded but the system kept running — retry succeeded, slow response, unexpected input. Investigate during work hours. |
| `error` | An operation failed — translation failed, DB write failed, Inngest step failed. May need attention. |
| `fatal` | The service is broken and cannot continue — startup failed, unrecoverable crash. Alert immediately. |

### Severity — how urgently someone must respond

| Severity | Meaning |
|---|---|
| `P1` | Wake someone now — SMS, phone call, PagerDuty |
| `P2` | Slack + on-call notification, fix within the hour |
| `P3` | Create a ticket, investigate during work hours |
| `P4` | Log only — no action needed, backlog at most |

### How they relate

The logger maps log levels to a **default** severity automatically:

| Log level | Default severity | Rationale |
|---|---|---|
| `trace` / `debug` | P4 | Pure developer noise |
| `info` | P4 | Useful history, no action |
| `warn` | P3 | Degraded, investigate later |
| `error` | P2 | Failed operation, on-call notification |
| `fatal` | P1 | Service broken, wake someone now |

You can override the default by passing `severity` explicitly when the situation demands it:

```ts
// Normal error — P2 by default
log.error({ event: 'translation.failed', roomCode }, 'Translation failed')

// Data-loss risk — escalate to P1 even though it is an error log
log.error({ severity: 'P1', event: 'db.write.failed', roomId }, 'Message lost — ScyllaDB write failed')

// Noisy warning that never needs attention — explicitly P4
log.warn({ severity: 'P4', event: 'reconnect.attempt' }, 'Socket reconnecting')
```

### Startup health check severity

Every health check failure — required or not — is logged as **P1**.

A non-required service being down (e.g. bad OpenAI key) means the app starts in a degraded state. That is still a broken service that must be fixed. It does not block startup but it must be treated with the same urgency as a required failure.

> **Rule:** do not downgrade non-required health check failures to P2/P3. All `startup.healthcheck.failed` events are `severity: P1`.

| Outcome | Log level | Severity |
|---|---|---|
| Required service down | `fatal` | `P1` — server won't start |
| Non-required service down | `error` | `P1` — server starts degraded, must be fixed |
| All checks pass | `info` | `P4` — normal |

### Grafana / Loki queries

Because `severity` is a structured JSON field on every log line, you can query by urgency independently of log level:

```
# P1 alerts in the last 5 minutes — should trigger a page
sum(count_over_time({service="live-translate-server"} | json | severity="P1" [5m]))

# P2 errors in the last hour — review on Slack
sum(count_over_time({service="live-translate-server"} | json | severity="P2" [1h]))

# Everything P3 and above in the last 24 h — morning review
{service="live-translate-server"} | json | severity=~"P1|P2|P3"
```

---

## Supported Languages

EN · ES · FR · DE · IT · PT · ZH · JA · KO · AR · RU · HI · TR · NL · PL · SV · CS · FI · HU · RO · UK

| Language | Code | Kokoro TTS | Piper TTS |
|---|---|---|---|
| English | `en` | ✅ | — |
| Spanish | `es` | ✅ | — |
| French | `fr` | ✅ | — |
| Hindi | `hi` | ✅ | — |
| Italian | `it` | ✅ | — |
| Japanese | `ja` | ✅ | — |
| Portuguese | `pt` | ✅ | — |
| Chinese | `zh` | ✅ | — |
| Arabic | `ar` | — | ✅ |
| Czech | `cs` | — | ✅ |
| German | `de` | — | ✅ |
| Finnish | `fi` | — | ✅ |
| Hungarian | `hu` | — | ✅ |
| Korean | `ko` | — | ❌ not in piper-voices v1.0 |
| Dutch | `nl` | — | ✅ |
| Polish | `pl` | — | ✅ |
| Romanian | `ro` | — | ✅ |
| Russian | `ru` | — | ✅ |
| Swedish | `sv` | — | ✅ |
| Turkish | `tr` | — | ✅ |
| Ukrainian | `uk` | — | ✅ |

Use `TTS_PROVIDER=hybrid` to enable all languages with a single setting.
