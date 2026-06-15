import './env'; // must be first — loads .env before any other module reads process.env
import { randomUUID } from 'crypto';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { connectAuthDb, pool as authPool } from './auth/db';
import { configurePassport } from './auth/passport';
import { authRouter } from './auth/routes';
import { internalRouter } from './auth/internalRoutes';
import { rateLimitApi } from './auth/rateLimiter';
import { logger, flushLogs } from './observability/logger';
import { severity } from './observability/severity';
import * as appMetrics from './observability/metrics';
import { metricsHandler } from './observability/prometheus';
import { roomManager } from './rooms/manager';
import { normalizeRoomConfig } from './rooms/config';
import * as db from './facades/db';
import * as queue from './facades/queue';
import * as workflows from './facades/workflows';
import * as translation from './facades/translation';
import * as stt from './facades/stt';
import * as tts from './facades/tts';
import * as voiceTranslation from './facades/voiceTranslation';
import * as realtime from './facades/realtime';
import { healthRouter } from './startup/healthEndpoint';
import { runHealthChecks } from './startup/healthCheck';

const PgSession = connectPgSimple(session);

const app = express();
app.set('trust proxy', 1);
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// ── Session + Passport (must be before routes) ─────────────────────────────
// Session is configured after connectAuthDb() so authPool is ready.
// We do a lazy-init pattern: the middleware references authPool by closure.
app.use((req, res, next) => {
  // Inline session setup so we can reference authPool after it's initialised.
  const sessionMiddleware = session({
    store: new PgSession({ pool: authPool, tableName: 'session' }),
    name:             'lt.sid',
    secret:           process.env.SESSION_SECRET ?? 'change-me-in-production',
    resave:           false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
  sessionMiddleware(req, res, next);
});
app.use(passport.initialize());
app.use(passport.session());

// ── Client logs ─────────────────────────────────────────────────────────────
// Mobile/web clients can send compact diagnostic events here; the server emits
// them through the normal logger, which can fan out to Loki/OpenObserve.
app.post('/client/logs', (req, res) => {
  const body = req.body as {
    logs?: Array<Record<string, unknown>>;
    platform?: string;
    app?: string;
    sessionId?: string;
  };
  const logs = Array.isArray(body.logs) ? body.logs.slice(0, 50) : [];
  const user = req.user as any;

  for (const entry of logs) {
    const level = String(entry.level || 'info').toLowerCase();
    const payload = {
      ...entry,
      event: String(entry.event || 'client.log'),
      source: 'client',
      clientPlatform: body.platform,
      clientApp: body.app,
      clientSessionId: body.sessionId,
      userId: user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (level === 'error' || level === 'fatal') {
      logger.error(payload, 'Client log');
    } else if (level === 'warn' || level === 'warning') {
      logger.warn(payload, 'Client log');
    } else if (level === 'debug') {
      logger.debug(payload, 'Client log');
    } else {
      logger.info(payload, 'Client log');
    }
  }

  res.status(204).end();
});

// ── Auth routes ─────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/internal', internalRouter);

// ── Profile images (static) ──────────────────────────────────────────────────
const IMAGES_DIR = process.env.PROFILE_IMAGES_DIR ?? './data/images/profiles';
app.use('/uploads/profiles', express.static(IMAGES_DIR));
app.use('/api/inngest', rateLimitApi);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info({
      event: 'http.request',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    }, 'HTTP request completed');
  });
  next();
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
});

// ── Inngest HTTP handler ───────────────────────────────────────────────────
// Inngest calls this endpoint to trigger and progress workflow steps.
app.use('/api/inngest', workflows.httpHandler());
app.use('/health', healthRouter);
app.get('/metrics', metricsHandler);

app.get('/api/rooms/:code', async (req, res) => {
  try {
    const room = await roomManager.getOrRestore(req.params.code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found.' });
      return;
    }

    const language = String(req.query.language || 'en');
    let history: any[] = [];

    if (room.config?.mode === 'solo_multilang') {
      const stored = await db.getRecentMessages(room.id, 100);
      const provider = room.config?.translationProvider;
      const missing = (stored as any[]).filter(msg => !msg.translations?.[language]);

      await Promise.all(missing.map(async (msg: any) => {
        const translated = await translateForRoom(msg.original, msg.senderLang, language, provider);
        msg.translations = { ...(msg.translations || {}), [language]: translated };
        db.addMessageTranslations(room.id, msg.id, msg.timestamp, { [language]: translated }).catch(
          (err: Error) => logger.warn({ event: 'solo.history.persist_failed', msgId: msg.id, err }, 'Failed to persist solo history translation'),
        );
      }));

      history = (stored as any[]).map(msg => formatStoredMessageForLanguage(msg, language, false));
    }

    res.json({ ok: true, room: roomManager.getPublic(room.code), history });
  } catch (err: any) {
    logger.error({ event: 'room.fetch_failed', severity: severity.P2, roomCode: req.params.code, err }, 'Room fetch failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/solo/rooms', async (req, res) => {
  try {
    const config = normalizeRoomConfig({
      ...req.body?.config,
      mode: 'solo_multilang',
    });
    if (config.mode !== 'solo_multilang' || !config.soloLanguages) {
      res.status(400).json({ ok: false, error: 'Solo rooms require two different languages.' });
      return;
    }

    const room = await roomManager.create({
      name: req.body?.name,
      config,
    });

    logger.info({
      event: 'solo.room.created',
      roomCode: room.code,
      roomId: room.id,
      soloLanguages: config.soloLanguages,
    }, 'Solo room created');

    res.json({ ok: true, code: room.code, room: roomManager.getPublic(room.code) });
  } catch (err: any) {
    logger.error({ event: 'solo.room.create_failed', severity: severity.P2, err }, 'Solo room creation failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/solo/rooms/:code/config', async (req, res) => {
  try {
    const room = await getSoloRoomOr404(req.params.code, res);
    if (!room) return;
    const config = await roomManager.updateConfig(room.code, {
      ...room.config,
      ...req.body?.config,
      mode: 'solo_multilang',
      soloLanguages: room.config?.soloLanguages,
    });
    res.json({ ok: true, config });
  } catch (err: any) {
    logger.error({ event: 'solo.config_failed', severity: severity.P2, roomCode: req.params.code, err }, 'Solo config update failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/solo/rooms/:code/text', async (req, res) => {
  const msgId = isUuid(req.body?.clientMsgId) ? req.body.clientMsgId : makeMsgId();

  try {
    const room = await getSoloRoomOr404(req.params.code, res);
    if (!room) return;
    if (!room.config?.input?.text) {
      res.status(400).json({ ok: false, id: msgId, error: 'Text input is disabled for this room.' });
      return;
    }

    const text = String(req.body?.text || '').trim();
    const senderLang = String(req.body?.senderLang || room.config.soloLanguages?.[0] || 'en');
    const targetLang = String(req.body?.targetLang || room.config.soloLanguages?.find((lang: string) => lang !== senderLang) || 'en');
    const sender = String(req.body?.sender || 'Solo');
    if (!text) {
      res.status(400).json({ ok: false, id: msgId, error: 'Message text is required.' });
      return;
    }

    appMetrics.recordMessage({ type: 'text', roomCode: room.code, roomId: room.id, language: senderLang, text });
    logger.info({
      event: 'solo.message.text.received',
      roomCode: room.code,
      roomId: room.id,
      msgId,
      senderLang,
      targetLang,
      textLength: text.length,
    }, 'Solo text message received');

    const translated = await translateForRoom(text, senderLang, targetLang, room.config?.translationProvider);
    const translations = { [senderLang]: text, [targetLang]: translated };
    const audioOutputs = room.config?.output?.translatedAudio
      ? Object.fromEntries([[targetLang, await synthesizeForRoom(translated, targetLang)]].filter(([, audio]) => audio))
      : {};

    await db.saveMessage({ roomId: room.id, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: false });

    res.json({
      ok: true,
      id: msgId,
      message: {
        id: msgId,
        original: text,
        translated,
        sender,
        senderLang,
        targetLang,
        isMine: true,
        isAudio: false,
        originalAudio: null,
        translatedAudio: (audioOutputs as any)[targetLang] ?? null,
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    logger.error({ event: 'solo.message.text_failed', severity: severity.P2, roomCode: req.params.code, msgId, err }, 'Solo text message failed');
    res.status(500).json({ ok: false, id: msgId, error: err.message });
  }
});

app.post('/api/solo/rooms/:code/audio', async (req, res) => {
  const msgId = makeMsgId();

  try {
    const room = await getSoloRoomOr404(req.params.code, res);
    if (!room) return;
    if (!room.config?.input?.voice) {
      res.status(400).json({ ok: false, id: msgId, error: 'Voice input is disabled for this room.' });
      return;
    }

    const audioBase64 = String(req.body?.audioBase64 || '');
    const mimeType = String(req.body?.mimeType || 'audio/webm');
    const senderLang = String(req.body?.senderLang || room.config.soloLanguages?.[0] || 'en');
    const targetLang = String(req.body?.targetLang || room.config.soloLanguages?.find((lang: string) => lang !== senderLang) || 'en');
    const sender = String(req.body?.sender || 'Solo');
    if (!audioBase64) {
      res.status(400).json({ ok: false, id: msgId, error: 'Audio is required.' });
      return;
    }

    const audioDuration = appMetrics.getAudioDurationSeconds({
      audioBase64,
      durationMs: req.body?.durationMs,
      durationSeconds: req.body?.durationSeconds,
      audioDurationMs: req.body?.audioDurationMs,
      audioDurationSeconds: req.body?.audioDurationSeconds,
    });
    appMetrics.recordMessage({ type: 'audio', roomCode: room.code, roomId: room.id, language: senderLang });
    appMetrics.recordAudioInput({
      roomCode: room.code,
      roomId: room.id,
      language: senderLang,
      seconds: audioDuration.seconds,
      source: audioDuration.source,
    });

    logger.info({
      event: 'solo.message.audio.received',
      roomCode: room.code,
      roomId: room.id,
      msgId,
      senderLang,
      targetLang,
      mimeType,
      audioDurationSeconds: audioDuration.seconds,
      audioDurationSource: audioDuration.source,
      audioBytesApprox: Math.round(audioBase64.length * 0.75),
    }, 'Solo audio message received');

    let text: string;
    let translations: Record<string, string>;
    let audioOutputs: Record<string, any>;

    if (room.config.voicePipeline === 'direct-voice-translation') {
      const direct = await voiceTranslation.translateVoice(audioBase64, mimeType, senderLang, [targetLang], room.config);
      text = direct.text?.trim() || '[voice message]';
      translations = { [senderLang]: text, ...(direct.translations || {}) };
      if (!translations[targetLang]) {
        translations[targetLang] = await translateForRoom(text, senderLang, targetLang, room.config?.translationProvider);
      }
      audioOutputs = direct.audioOutputs || {};
    } else {
      text = (await stt.transcribe(audioBase64, mimeType, senderLang)).trim();
      if (!text) throw new Error('Empty transcription');
      const translated = await translateForRoom(text, senderLang, targetLang, room.config?.translationProvider);
      translations = { [senderLang]: text, [targetLang]: translated };
      audioOutputs = room.config?.output?.translatedAudio
        ? Object.fromEntries([[targetLang, await synthesizeForRoom(translated, targetLang)]].filter(([, audio]) => audio))
        : {};
    }

    appMetrics.recordWords({
      type: 'audio',
      stage: 'transcribed',
      roomCode: room.code,
      roomId: room.id,
      language: senderLang,
      text,
    });

    await db.saveMessage({ roomId: room.id, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true });

    res.json({
      ok: true,
      id: msgId,
      message: {
        id: msgId,
        original: text,
        translated: translations[targetLang] ?? translations[senderLang] ?? text,
        sender,
        senderLang,
        targetLang,
        isMine: true,
        isAudio: true,
        originalAudio: { audioBase64, mimeType },
        translatedAudio: audioOutputs[targetLang] ?? null,
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    logger.error({ event: 'solo.message.audio_failed', severity: severity.P2, roomCode: req.params.code, msgId, err }, 'Solo audio message failed');
    res.status(500).json({ ok: false, id: msgId, error: err.message });
  }
});

function makeMsgId() {
  return randomUUID();
}

function isUuid(value: any) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function translateForRoom(text: string, senderLang: string, targetLang: string, provider?: string) {
  if (senderLang === targetLang) return text;
  try {
    return await translation.translate(text, senderLang, targetLang, provider);
  } catch (err) {
    logger.warn({
      event: 'solo.translation_failed',
      severity: severity.P3,
      senderLang,
      targetLang,
      provider,
      err,
    }, 'Solo translation failed');
    return `${text} (not translated)`;
  }
}

async function synthesizeForRoom(text: string, language: string) {
  try {
    return await tts.synthesize(text, language);
  } catch (err) {
    logger.warn({ event: 'solo.tts_failed', severity: severity.P3, language, err }, 'Solo TTS failed');
    return null;
  }
}

function formatStoredMessageForLanguage(msg: any, targetLang: string, isMine = false) {
  return {
    id:              msg.id,
    original:        msg.original,
    translated:      msg.translations?.[targetLang] ?? msg.translations?.[msg.senderLang] ?? msg.original,
    sender:          msg.sender,
    senderLang:      msg.senderLang,
    targetLang,
    isMine,
    isAudio:         msg.isAudio,
    originalAudio:   null,
    translatedAudio: msg.audioOutputs?.[targetLang] ?? null,
    timestamp:       msg.timestamp,
  };
}

async function getSoloRoomOr404(code: string, res: express.Response) {
  const room = await roomManager.getOrRestore(code);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return null;
  }
  if (room.config?.mode !== 'solo_multilang') {
    res.status(409).json({ ok: false, error: 'Room is not a solo room.' });
    return null;
  }
  return room;
}

function startProcessMemoryLogger() {
  const intervalMs = Number.parseInt(process.env.MEMORY_LOG_INTERVAL_MS || '30000', 10);
  if (intervalMs <= 0) return;

  const interval = setInterval(() => {
    const memory = process.memoryUsage();
    logger.info({
      event: 'process.memory',
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      externalMb: Math.round(memory.external / 1024 / 1024),
      arrayBuffersMb: Math.round(memory.arrayBuffers / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
    }, 'Process memory snapshot');
  }, intervalMs);

  interval.unref?.();
}

function emitToRoom(roomCode: string, event: string, payload: any) {
  io.to(`room:${roomCode}`).emit(event, payload);
}

// ── Read-receipt tracking (in-memory, single server) ──────────────────────
// msgId → { senderSocketId, needed: number, readers: Set<socketId> }
const pendingReads = new Map<string, { senderSocketId: string; needed: number; readers: Set<string> }>();

async function publishMessageError(roomCode: string, msgId: string) {
  try {
    await queue.publishSocketEvent('message:error', { roomCode, msgId });
  } catch {
    emitToRoom(roomCode, 'message:error', { id: msgId });
  }
}

// ── Queue consumer — broadcast to local Socket.io clients ─────────────────
// Every Socket.io server instance runs this consumer. When any server
// publishes an event, ALL instances receive it and forward to local clients.
async function startQueueConsumer() {
  await queue.startConsuming(async (data) => {
    const { type, roomCode, message } = data;

    if (type === 'message:translating') {
      emitToRoom(roomCode, 'message:translating', { id: data.msgId });
    }

    if (type === 'message:progress') {
      emitToRoom(roomCode, 'message:progress', { id: data.msgId, progress: data.progress, stage: data.stage });
    }

    if (type === 'message:incoming') {
      // Each client receives only the translation for their language
      const room = roomManager.get(roomCode);
      if (!room) return;

      const participants = roomManager.getParticipants(roomCode);
      const others = participants.filter((p: any) => p.socketId !== message.senderSocketId);

      participants.forEach((participant: any) => {
        const translated = message.translations[participant.language]
          ?? message.translations[message.senderLang]
          ?? message.original;
        const isSender = participant.socketId === message.senderSocketId;
        const isSoloRoom = room.config?.mode === 'solo_multilang';
        const canUseOriginalAudio = isSender || participant.language === message.senderLang;
        const translatedAudio = isSender && !isSoloRoom ? null : (message.audioOutputs?.[participant.language] ?? null);

        io.to(participant.socketId).emit('message:incoming', {
          id:         message.id,
          original:   message.original,
          translated,
          sender:     message.sender,
          senderLang: message.senderLang,
          targetLang: participant.language,
          isMine:     isSender,
          isAudio:    message.isAudio,
          originalAudio: canUseOriginalAudio ? (message.originalAudio ?? null) : null,
          translatedAudio,
          timestamp:  message.timestamp,
        });
      });

      // Read-receipt tracking: register how many non-sender participants must
      // read before we flip the message to "read" (green double-check).
      // Only register on the server instance where the sender is connected.
      if (message.senderSocketId && io.sockets.sockets.has(message.senderSocketId)) {
        if (others.length === 0) {
          // Sender is alone — jump straight to delivered (no one to read it)
          io.to(message.senderSocketId).emit('message:delivered', { id: message.id });
        } else {
          pendingReads.set(message.id, {
            senderSocketId: message.senderSocketId,
            needed: others.length,
            readers: new Set(),
          });
          // Clean up stale entries after 24 h to avoid memory leaks
          setTimeout(() => pendingReads.delete(message.id), 24 * 60 * 60 * 1000);
        }
      }
    }

    if (type === 'message:error') {
      emitToRoom(roomCode, 'message:error', { id: data.msgId });
    }

    if (type === 'room:participants-updated') {
      emitToRoom(roomCode, 'room:participants-updated', { participants: data.participants });
    }
  });
}

// ── Socket.io handlers ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.info({ event: 'socket.connected', socketId: socket.id }, 'Socket connected');

  // ── Peek room (for join pre-fill — no auth required) ────────────────────
  socket.on('room:peek', ({ code }: any = {}, cb) => {
    try {
      const room = roomManager.get(String(code ?? '').toUpperCase());
      if (!room) return cb({ ok: false });
      cb({ ok: true, guestDefaultLanguage: room.config?.guestDefaultLanguage ?? null });
    } catch {
      cb({ ok: false });
    }
  });

  // ── Create room ──────────────────────────────────────────────────────────
  socket.on('room:create', async ({ name, nickname, language, config }: any = {}, cb) => {
    try {
      const room = await roomManager.create({ name, config: normalizeRoomConfig(config) });
      const participant = roomManager.addParticipant(room.code, {
        socketId: socket.id,
        nickname: nickname || 'Host',
        language: language || 'en',
        isHost: true,
      });

      socket.join(`room:${room.code}`);
      socket.data.roomCode    = room.code;
      socket.data.roomId      = room.id;
      socket.data.participant = participant;

      logger.info({
        event: 'room.created',
        roomCode: room.code,
        roomId: room.id,
        socketId: socket.id,
        nickname,
        language: participant.language,
      }, 'Room created');
      cb?.({ ok: true, code: room.code, room: roomManager.getPublic(room.code) });
    } catch (err: any) {
      logger.error({ event: 'room.create_failed', severity: severity.P2, socketId: socket.id, err }, 'Room creation failed');
      cb?.({ ok: false, error: err.message });
    }
  });

  // ── Join room ────────────────────────────────────────────────────────────
  socket.on('room:join', async ({ code, nickname, language, isHost: clientIsHost }: any = {}, cb) => {
    try {
      // Restore from ScyllaDB if server restarted
      const room = await roomManager.getOrRestore(code);
      if (!room) {
        cb?.({ ok: false, error: 'Room not found. Check the code and try again.' });
        return;
      }

      const existingParticipant = socket.data.roomCode === room.code
        ? socket.data.participant
        : null;

      const participant = roomManager.addParticipant(room.code, {
        socketId: socket.id,
        nickname: nickname || existingParticipant?.nickname || 'Guest',
        language: language || existingParticipant?.language || 'en',
        isHost:   existingParticipant?.isHost || clientIsHost || false,
      });

      socket.join(`room:${room.code}`);
      socket.data.roomCode    = room.code;
      socket.data.roomId      = room.id;
      socket.data.participant = participant;

      // Notify other participants only for a new member. Existing sockets can
      // rejoin to refresh state after navigation, reload, or reconnect.
      if (!existingParticipant) {
        socket.to(`room:${room.code}`).emit('room:participant-joined', { participant });
      }
      io.to(`room:${room.code}`).emit('room:participants-updated', {
        participants: roomManager.getParticipants(room.code),
      });

      // Load chat history and send to the joining participant, translating any
      // messages that weren't translated into their language when originally sent.
      try {
        const history = await db.getRecentMessages(room.id, 100);
        if (history.length > 0) {
          const lang     = language || 'en';
          const provider = room.config?.translationProvider;

          const missing = (history as any[]).filter(msg => !msg.translations[lang]);
          if (missing.length > 0) {
            logger.info({
              event: 'room.history_translate',
              roomCode: room.code,
              language: lang,
              count: missing.length,
            }, 'Translating history for joining participant');

            await Promise.all(missing.map(async (msg: any) => {
              try {
                const text = await translation.translate(msg.original, msg.senderLang, lang, provider);
                msg.translations[lang] = text;
                // Persist back so future joins for the same language are instant
                db.addMessageTranslations(room.id, msg.id, msg.timestamp, { [lang]: text }).catch(
                  (err: Error) => logger.warn({ event: 'history.translation.persist_failed', msgId: msg.id, err }, 'Failed to persist history translation'),
                );
              } catch (err) {
                logger.warn({ event: 'history.translate_message_failed', msgId: msg.id, senderLang: msg.senderLang, targetLang: lang, err }, 'Failed to translate history message');
              }
            }));
          }

          const formatted = (history as any[]).map(msg => ({
            id:              msg.id,
            original:        msg.original,
            translated:      msg.translations[lang] ?? msg.translations[msg.senderLang] ?? msg.original,
            sender:          msg.sender,
            senderLang:      msg.senderLang,
            targetLang:      lang,
            isMine:          false,
            isAudio:         msg.isAudio,
            originalAudio:   null,
            translatedAudio: msg.audioOutputs?.[lang] ?? null,
            timestamp:       msg.timestamp,
          }));
          socket.emit('room:history', { messages: formatted });
        }
      } catch (err) {
        logger.error({ event: 'room.history_failed', severity: severity.P3, roomCode: room.code, roomId: room.id, socketId: socket.id, err }, 'Failed to load room history');
      }

      logger.info({
        event: 'room.joined',
        roomCode: room.code,
        roomId: room.id,
        socketId: socket.id,
        nickname: participant.nickname,
        language: participant.language,
      }, 'Participant joined room');
      cb?.({ ok: true, room: roomManager.getPublic(room.code) });
    } catch (err: any) {
      logger.error({ event: 'room.join_failed', severity: severity.P2, socketId: socket.id, roomCode: code, err }, 'Room join failed');
      cb?.({ ok: false, error: err.message });
    }
  });

  // ── Update language ──────────────────────────────────────────────────────
  socket.on('room:update-language', ({ language }: any = {}, cb) => {
    const { roomCode, participant } = socket.data;
    if (!roomCode || !participant || !language) { cb?.({ ok: false }); return; }
    roomManager.updateParticipantLanguage(roomCode, socket.id, language);
    socket.data.participant = { ...participant, language };
    io.to(`room:${roomCode}`).emit('room:participants-updated', {
      participants: roomManager.getParticipants(roomCode),
    });
    cb?.({ ok: true });
  });

  // ── Update room media config ─────────────────────────────────────────────
  socket.on('room:update-config', async ({ config }: any = {}, cb) => {
    const { roomCode, participant } = socket.data;
    if (!roomCode || !participant?.isHost) {
      cb?.({ ok: false, error: 'Only the host can update room settings.' });
      return;
    }

    try {
      const roomConfig = await roomManager.updateConfig(roomCode, config);
      io.to(`room:${roomCode}`).emit('room:config-updated', { config: roomConfig });
      cb?.({ ok: true, config: roomConfig });
    } catch (err: any) {
      cb?.({ ok: false, error: err.message });
    }
  });

  // ── Text message → queue + Inngest ───────────────────────────────────────
  socket.on('message:text', async ({ text, clientMsgId, senderLang: clientSenderLang }: any = {}, cb) => {
    const { roomCode, roomId, participant } = socket.data;
    if (!roomCode || !participant || !text?.trim()) {
      cb?.({ ok: false, error: 'Not connected to a room.' });
      return;
    }

    const msgId        = isUuid(clientMsgId) ? clientMsgId : makeMsgId();
    const participants = roomManager.getParticipants(roomCode);
    const roomConfig   = roomManager.get(roomCode)?.config;
    // solo_multilang: client sends the active speaker language explicitly
    const effectiveSenderLang = (typeof clientSenderLang === 'string' && clientSenderLang)
      ? clientSenderLang
      : participant.language;

    if (roomConfig && !roomConfig.input.text) {
      cb?.({ ok: false, error: 'Text input is disabled for this room.' });
      return;
    }

    try {
      appMetrics.recordMessage({
        type: 'text',
        roomCode,
        roomId,
        language: participant.language,
        text: text.trim(),
      });

      logger.info({
        event: 'message.text.received',
        roomCode,
        roomId,
        msgId,
        socketId: socket.id,
        senderLang: participant.language,
        participantCount: participants.length,
        textLength: text.trim().length,
      }, 'Text message received');

      // 1. Immediately notify all servers to show the in-flight message
      await queue.publishTranslating(roomCode, msgId);
      await queue.publishMessageProgress(roomCode, msgId, 25, 'received');

      // 2. Trigger Inngest workflow (translate → save → broadcast)
      await workflows.triggerTranslate({
        msgId,
        roomCode,
        roomId,
        text:           text.trim(),
        senderLang:     effectiveSenderLang,
        sender:         participant.nickname,
        senderSocketId: socket.id,
        participants,
        knownLanguages: roomManager.getKnownLanguages(roomCode),
        roomConfig,
      });
      cb?.({ ok: true, id: msgId });
    } catch (err: any) {
      logger.error({ event: 'message.text_failed', severity: severity.P2, roomCode, roomId, msgId, socketId: socket.id, err }, 'Text message failed');
      await publishMessageError(roomCode, msgId);
      cb?.({ ok: false, id: msgId, error: err.message });
    }
  });

  // ── Audio message → queue + Inngest ──────────────────────────────────────
  socket.on('message:audio', async ({ audioBase64, mimeType, durationMs, durationSeconds, audioDurationMs, audioDurationSeconds, senderLang: clientSenderLang, clientMsgId }: any = {}) => {
    const { roomCode, roomId, participant } = socket.data;
    if (!roomCode || !participant || !audioBase64) return;
    const effectiveSenderLang = (typeof clientSenderLang === 'string' && clientSenderLang)
      ? clientSenderLang
      : participant.language;

    const msgId        = isUuid(clientMsgId) ? clientMsgId : makeMsgId();
    const participants = roomManager.getParticipants(roomCode);
    const roomConfig   = roomManager.get(roomCode)?.config;

    if (roomConfig && !roomConfig.input.voice) return;

    try {
      const audioDuration = appMetrics.getAudioDurationSeconds({
        audioBase64,
        durationMs,
        durationSeconds,
        audioDurationMs,
        audioDurationSeconds,
      });

      appMetrics.recordMessage({
        type: 'audio',
        roomCode,
        roomId,
        language: participant.language,
      });
      appMetrics.recordAudioInput({
        roomCode,
        roomId,
        language: participant.language,
        seconds: audioDuration.seconds,
        source: audioDuration.source,
      });

      logger.info({
        event: 'message.audio.received',
        roomCode,
        roomId,
        msgId,
        socketId: socket.id,
        senderLang: participant.language,
        participantCount: participants.length,
        mimeType,
        audioDurationSeconds: audioDuration.seconds,
        audioDurationSource: audioDuration.source,
        audioBytesApprox: Math.round(audioBase64.length * 0.75),
      }, 'Audio message received');

      // 1. Show spinner on all servers immediately (backward-compat)
      await queue.publishTranslating(roomCode, msgId);
      await queue.publishMessageProgress(roomCode, msgId, 25, 'received');

      // 2. Trigger Inngest workflow (transcribe → translate → save → broadcast)
      await workflows.triggerTranscribe({
        msgId,
        roomCode,
        roomId,
        audioBase64,
        mimeType,
        senderLang:     effectiveSenderLang,
        sender:         participant.nickname,
        senderSocketId: socket.id,
        participants,
        knownLanguages: roomManager.getKnownLanguages(roomCode),
        roomConfig,
      });
    } catch (err: any) {
      logger.error({ event: 'message.audio_failed', severity: severity.P2, roomCode, roomId, msgId, socketId: socket.id, err }, 'Audio message failed');
      await publishMessageError(roomCode, msgId);
    }
  });

  // ── Read receipts ────────────────────────────────────────────────────────
  socket.on('message:read', ({ msgIds }: any = {}) => {
    if (!Array.isArray(msgIds)) return;
    for (const msgId of msgIds) {
      const pending = pendingReads.get(msgId);
      if (!pending || pending.readers.has(socket.id)) continue;
      pending.readers.add(socket.id);
      if (pending.readers.size >= pending.needed) {
        io.to(pending.senderSocketId).emit('message:read', { id: msgId });
        pendingReads.delete(msgId);
      }
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { roomCode, participant } = socket.data;
    if (roomCode && participant) {
      roomManager.removeParticipant(roomCode, socket.id);
      io.to(`room:${roomCode}`).emit('room:participant-left', { socketId: socket.id });
      io.to(`room:${roomCode}`).emit('room:participants-updated', {
        participants: roomManager.getParticipants(roomCode),
      });
      logger.info({
        event: 'room.left',
        roomCode,
        socketId: socket.id,
        nickname: participant.nickname,
      }, 'Participant left room');
    }
    logger.info({ event: 'socket.disconnected', socketId: socket.id }, 'Socket disconnected');
  });
});

// ── Startup ────────────────────────────────────────────────────────────────

async function start() {
  logger.info({ event: 'server.starting' }, 'LiveTranslate starting');
  startProcessMemoryLogger();

  // Verify all external services are reachable before accepting traffic
  await runHealthChecks();

  // Auth DB must connect before session middleware uses authPool
  await connectAuthDb();
  configurePassport();

  // Connect to the selected database provider
  await db.connect();

  // Connect to the selected queue and start consuming broadcast events
  await queue.connect();
  await realtime.configureSocketAdapter(io);
  await startQueueConsumer();

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info({
      event: 'server.ready',
      port: Number(PORT),
      url: `http://localhost:${PORT}`,
      inngestUrl: `http://localhost:${PORT}/api/inngest`,
    }, 'Server ready');
  });
}

start().catch(async (err) => {
  logger.fatal({ event: 'server.start_failed', severity: severity.P1, err }, 'Failed to start');
  await flushLogs();
  process.exit(1);
});
