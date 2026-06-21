import './env'; // must be first — loads .env before any other module reads process.env
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { connectAuthDb, pool as authPool, findUserByApiToken, recordRoomVisit } from './auth/db';
import { planLimits } from './auth/plans';
import { configurePassport } from './auth/passport';
import { authRouter } from './auth/routes';
import { internalRouter } from './auth/internalRoutes';
import { rateLimitApi } from './auth/rateLimiter';
import { hasUsageBalance, recordUsage, wordCount } from './auth/usage';
import { logger, flushLogs } from './observability/logger';
import { dumpIncomingAudio } from './debug/audioDump';
import { persistMessageAudio, findOriginalAudio, saveAudioFile } from './audio/store';
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
import { connectEmailQueue } from './email/queue';

const PgSession = connectPgSimple(session);
const STREAM_AUDIO_SAMPLE_RATE = 16000;
const STREAM_AUDIO_CHANNELS = 1;
const STREAM_AUDIO_BITS_PER_SAMPLE = 16;
const STREAM_AUDIO_MAX_CHUNK_BYTES = 256 * 1024;
const STREAM_AUDIO_MAX_AGE_MS = 10 * 60 * 1000;
const INSUFFICIENT_CREDITS = 'insufficient_credits';

function ceilSeconds(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
}

function userBalanceError(kind: 'text' | 'voice' | 'realtime') {
  if (kind === 'text') return 'Text credit exhausted.';
  if (kind === 'realtime') return 'Realtime voice credit exhausted.';
  return 'Voice credit exhausted.';
}

type AudioUploadSession = {
  sessionId: string;
  msgId: string;
  roomCode: string;
  roomId: string;
  socketId: string;
  sender: string;
  userId?: string | null;
  senderLang: string;
  tempPcmPath: string;
  nextSeq: number;
  bytesReceived: number;
  startedAt: number;
  lastChunkAt: number;
  writeQueue: Promise<void>;
};

const audioUploadSessions = new Map<string, AudioUploadSession>();

function audioUploadDir() {
  const dir = path.join(os.tmpdir(), 'live-translate-audio-streams');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupAudioUploadSession(sessionId: string) {
  const session = audioUploadSessions.get(sessionId);
  if (!session) return;
  audioUploadSessions.delete(sessionId);
  session.writeQueue.finally(() => {
    fs.promises.unlink(session.tempPcmPath).catch(() => {});
  }).catch(() => {});
}

function audioChunkBuffer(input: any): Buffer | null {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

function wavHeader(dataBytes: number, sampleRate: number, channels: number, bitsPerSample: number) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

function pcmToWavBuffer(pcm: Buffer) {
  return Buffer.concat([
    wavHeader(pcm.length, STREAM_AUDIO_SAMPLE_RATE, STREAM_AUDIO_CHANNELS, STREAM_AUDIO_BITS_PER_SAMPLE),
    pcm,
  ]);
}

setInterval(() => {
  const cutoff = Date.now() - STREAM_AUDIO_MAX_AGE_MS;
  for (const [sessionId, session] of audioUploadSessions) {
    if (session.lastChunkAt < cutoff) cleanupAudioUploadSession(sessionId);
  }
}, 60_000).unref();

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

app.use(async (req, _res, next) => {
  if (req.user) return next();
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next();
  try {
    const user = await findUserByApiToken(token);
    if (user) (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
});

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

io.use(async (socket, next) => {
  const rawToken = socket.handshake.auth?.token
    ?? socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '');
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) return next();
  try {
    const user = await findUserByApiToken(token);
    if (user) socket.data.user = user;
    next();
  } catch (err) {
    next(err as Error);
  }
});

// ── Inngest HTTP handler ───────────────────────────────────────────────────
// Inngest calls this endpoint to trigger and progress workflow steps.
if (workflows.isInngestEnabled()) {
  app.use('/api/inngest', workflows.httpHandler());
}
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

// Recover a voice message's original audio on demand (not pushed over the socket).
app.get('/api/rooms/:code/messages/:msgId/audio/original', async (req, res) => {
  try {
    const { code, msgId } = req.params;
    if (!isUuid(msgId)) {
      res.status(400).json({ ok: false, error: 'Invalid message id.' });
      return;
    }
    const room = await roomManager.getOrRestore(code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found.' });
      return;
    }
    const file = findOriginalAudio(msgId);
    if (!file) {
      res.status(404).json({ ok: false, error: 'Audio not found.' });
      return;
    }
    res.sendFile(file.path, { headers: { 'Content-Type': file.mimeType, 'Cache-Control': 'private, max-age=3600' } });
  } catch (err: any) {
    logger.error({ event: 'room.audio.recover_failed', severity: severity.P3, roomCode: req.params.code, msgId: req.params.msgId, err }, 'Original audio recovery failed');
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
    const user = req.user as any;
    if (user?.id && !(await hasUsageBalance(user.id, 'text_words'))) {
      res.status(402).json({ ok: false, id: msgId, errorCode: INSUFFICIENT_CREDITS, error: userBalanceError('text') });
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
    const shouldGenerateAudio = Boolean(room.config?.output?.translatedAudio);

    // Phase 1: save + return the text now. TTS audio is fetched separately
    // (phase 2: POST …/messages/:msgId/audio) so the text isn't held up by it.
    await db.saveMessage({ roomId: room.id, msgId, sender, senderLang, original: text, translations, audioOutputs: {}, isAudio: false });
    const usageBalance = user?.id
      ? await recordUsage({ userId: user.id, usageKind: 'text_words', amount: wordCount(text), roomCode: room.code })
      : null;

    res.json({
      ok: true,
      id: msgId,
      usageBalance,
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
        translatedAudio: null,
        audioPending: shouldGenerateAudio,
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    logger.error({ event: 'solo.message.text_failed', severity: severity.P2, roomCode: req.params.code, msgId, err }, 'Solo text message failed');
    res.status(500).json({ ok: false, id: msgId, error: err.message });
  }
});

app.post('/api/solo/rooms/:code/audio', async (req, res) => {
  const msgId = isUuid(req.body?.clientMsgId) ? req.body.clientMsgId : makeMsgId();

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
    const user = req.user as any;
    const usageKind = room.config.voicePipeline === 'direct-voice-translation'
      ? 'realtime_seconds'
      : 'voice_seconds';
    if (user?.id && !(await hasUsageBalance(user.id, usageKind))) {
      res.status(402).json({
        ok: false,
        id: msgId,
        errorCode: INSUFFICIENT_CREDITS,
        error: userBalanceError(usageKind === 'realtime_seconds' ? 'realtime' : 'voice'),
      });
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

    dumpIncomingAudio(audioBase64, mimeType, { source: 'solo-http', msgId, senderLang });

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

      appMetrics.recordWords({
        type: 'audio',
        stage: 'transcribed',
        roomCode: room.code,
        roomId: room.id,
        language: senderLang,
        text,
      });

      const { originalAudioFile, translatedAudioFiles } = persistMessageAudio({
        msgId,
        originalAudio: { audioBase64, mimeType },
        audioOutputs,
      });
      await db.saveMessage({ roomId: room.id, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true, originalAudioFile, translatedAudioFiles });
      const usageBalance = user?.id
        ? await recordUsage({
            userId: user.id,
            usageKind: 'realtime_seconds',
            amount: ceilSeconds(audioDuration.seconds),
            roomCode: room.code,
          })
        : null;

      res.json({
        ok: true,
        id: msgId,
        usageBalance,
        message: {
          id: msgId,
          original: text,
          translated: translations[targetLang] ?? translations[senderLang] ?? text,
          sender,
          senderLang,
          targetLang,
          isMine: true,
          isAudio: true,
          originalAudio: null,
          hasOriginalAudio: Boolean(originalAudioFile),
          translatedAudio: audioOutputs[targetLang] ?? null,
          audioPending: false,
          timestamp: Date.now(),
        },
      });
      return;
    } else {
      text = (await stt.transcribe(audioBase64, mimeType, senderLang)).trim();
      if (!text) throw new Error('Empty transcription');
      const translated = await translateForRoom(text, senderLang, targetLang, room.config?.translationProvider);
      translations = { [senderLang]: text, [targetLang]: translated };
      audioOutputs = {};
    }

    appMetrics.recordWords({
      type: 'audio',
      stage: 'transcribed',
      roomCode: room.code,
      roomId: room.id,
      language: senderLang,
      text,
    });

    const shouldGenerateAudio = Boolean(room.config?.output?.translatedAudio);
    // Phase 1: persist the original recording + save the TEXT message now, and
    // respond immediately. The translated TTS audio is generated in a separate
    // request (phase 2: POST …/messages/:msgId/audio) so solo HTTP gets the text
    // fast instead of blocking on — and freezing at — audio generation.
    const { originalAudioFile, translatedAudioFiles } = persistMessageAudio({
      msgId,
      originalAudio: { audioBase64, mimeType },
      audioOutputs,
    });
    await db.saveMessage({ roomId: room.id, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true, originalAudioFile, translatedAudioFiles });
    const usageBalance = user?.id
      ? await recordUsage({
          userId: user.id,
          usageKind: 'voice_seconds',
          amount: ceilSeconds(audioDuration.seconds),
          roomCode: room.code,
        })
      : null;

    res.json({
      ok: true,
      id: msgId,
      usageBalance,
      message: {
        id: msgId,
        original: text,
        translated: translations[targetLang] ?? translations[senderLang] ?? text,
        sender,
        senderLang,
        targetLang,
        isMine: true,
        isAudio: true,
        // Original audio is recovered on demand via GET …/audio/original, not pushed.
        originalAudio: null,
        hasOriginalAudio: Boolean(originalAudioFile),
        translatedAudio: null,
        audioPending: shouldGenerateAudio,
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    logger.error({ event: 'solo.message.audio_failed', severity: severity.P2, roomCode: req.params.code, msgId, err }, 'Solo audio message failed');
    res.status(500).json({ ok: false, id: msgId, error: err.message });
  }
});

// Phase 2 for solo HTTP: generate the translated TTS audio on demand. The client
// calls this after it has shown the text (when audioPending was true), so the
// text arrives fast and the audio follows in a second request.
app.post('/api/solo/rooms/:code/messages/:msgId/audio', async (req, res) => {
  try {
    const room = await getSoloRoomOr404(req.params.code, res);
    if (!room) return;
    const { msgId } = req.params;
    if (!isUuid(msgId)) {
      res.status(400).json({ ok: false, error: 'Invalid message id.' });
      return;
    }
    const lang = String(req.body?.lang || room.config.soloLanguages?.[1] || 'en');
    const text = String(req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ ok: false, error: 'Text is required.' });
      return;
    }

    const audio = await synthesizeForRoom(text, lang);
    if (!audio) {
      // TTS unavailable for this language — not an error; just no audio.
      res.json({ ok: true, translatedAudio: null });
      return;
    }
    saveAudioFile(audio, `${msgId}.${lang}`);
    res.json({ ok: true, translatedAudio: audio });
  } catch (err: any) {
    logger.error({ event: 'solo.message.audio_phase2_failed', severity: severity.P3, roomCode: req.params.code, msgId: req.params.msgId, err }, 'Solo audio phase-2 failed');
    res.status(500).json({ ok: false, error: err.message });
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
    hasOriginalAudio: Boolean(msg.originalAudioFile),
    translatedAudio: msg.audioOutputs?.[targetLang] ?? null,
    timestamp:       msg.timestamp,
  };
}

function getSocketMessageTargetLang(room: any, participant: any, senderLang: string) {
  if (room?.config?.mode === 'solo_multilang' && Array.isArray(room.config.soloLanguages)) {
    return room.config.soloLanguages.find((lang: string) => lang && lang !== senderLang)
      ?? participant.language;
  }
  return participant.language;
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

    if (type === 'message:translated') {
      const room = roomManager.get(roomCode);
      if (!room) return;

      const participants = roomManager.getParticipants(roomCode);
      participants.forEach((participant: any) => {
        const targetLang = getSocketMessageTargetLang(room, participant, message.senderLang);
        const translated = message.translations[targetLang]
          ?? message.translations[message.senderLang]
          ?? message.original;
        const isSender = participant.socketId === message.senderSocketId;

        io.to(participant.socketId).emit('message:translated', {
          id:         message.id,
          original:   message.original,
          translated,
          sender:     message.sender,
          senderLang: message.senderLang,
          targetLang,
          isMine:     isSender,
          isAudio:    message.isAudio,
          originalAudio: null,
          hasOriginalAudio: Boolean(message.isAudio) && (isSender || participant.language === message.senderLang),
          translatedAudio: null,
          audioPending: true,
          timestamp:  message.timestamp,
          progress:      message.progress ?? 75,
          progressStage: message.progressStage ?? message.stage ?? 'generatingAudio',
        });
      });
    }

    if (type === 'message:incoming') {
      // Each client receives only the translation for their language
      const room = roomManager.get(roomCode);
      if (!room) return;

      const participants = roomManager.getParticipants(roomCode);
      const others = participants.filter((p: any) => p.socketId !== message.senderSocketId);

      participants.forEach((participant: any) => {
        const targetLang = getSocketMessageTargetLang(room, participant, message.senderLang);
        const translated = message.translations[targetLang]
          ?? message.translations[message.senderLang]
          ?? message.original;
        const isSender = participant.socketId === message.senderSocketId;
        const isSoloRoom = room.config?.mode === 'solo_multilang';
        const translatedAudio = isSender && !isSoloRoom ? null : (message.audioOutputs?.[targetLang] ?? null);
        const audioOutputLangs = Object.keys(message.audioOutputs || {});
        const ttsStatus = room.config?.output?.translatedAudio
          ? (translatedAudio ? 'ready' : 'empty')
          : 'disabled';
        logger.info({
          event: 'socket.message_incoming.emit',
          roomCode,
          msgId: message.id,
          socketId: participant.socketId,
          targetLang,
          isSender,
          isSoloRoom,
          hasTranslatedAudio: Boolean(translatedAudio),
          audioOutputLangs,
          ttsStatus,
        }, 'Emitting final message to socket');

        io.to(participant.socketId).emit('message:incoming', {
          id:         message.id,
          original:   message.original,
          translated,
          sender:     message.sender,
          senderLang: message.senderLang,
          targetLang,
          isMine:     isSender,
          isAudio:    message.isAudio,
          // Original audio is no longer pushed inline — recovered on demand via
          // GET …/audio/original. Offered to the sender and same-language listeners.
          originalAudio: null,
          hasOriginalAudio: Boolean(message.isAudio) && (isSender || participant.language === message.senderLang),
          translatedAudio,
          audioPending: false,
          ttsStatus,
          ttsError: ttsStatus === 'empty' ? `No translated audio for ${targetLang}; audio outputs: ${audioOutputLangs.join(',') || 'none'}` : undefined,
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
      const user = socket.data.user;
      const participant = roomManager.addParticipant(room.code, {
        socketId: socket.id,
        nickname: nickname || 'Host',
        language: language || 'en',
        isHost: true,
        userId: user?.id,
      });

      socket.join(`room:${room.code}`);
      socket.data.roomCode    = room.code;
      socket.data.roomId      = room.id;
      socket.data.participant = participant;

      // Best-effort: remember this room in the user's history (re-enter later).
      if (user?.id) {
        recordRoomVisit(user.id, room.code, room.name ?? name ?? null).catch(
          (err: Error) => logger.warn({ event: 'room.visit_record_failed', roomCode: room.code, err }, 'Failed to record room visit'),
        );
      }

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
      const user = socket.data.user;

      const participant = roomManager.addParticipant(room.code, {
        socketId: socket.id,
        nickname: nickname || existingParticipant?.nickname || 'Guest',
        language: language || existingParticipant?.language || 'en',
        isHost:   existingParticipant?.isHost || clientIsHost || false,
        userId:   existingParticipant?.userId || user?.id,
      });

      socket.join(`room:${room.code}`);
      socket.data.roomCode    = room.code;
      socket.data.roomId      = room.id;
      socket.data.participant = participant;

      // Best-effort: remember this room in the user's history (re-enter later).
      if (user?.id) {
        recordRoomVisit(user.id, room.code, room.name ?? null).catch(
          (err: Error) => logger.warn({ event: 'room.visit_record_failed', roomCode: room.code, err }, 'Failed to record room visit'),
        );
      }

      // Notify other participants only for a new member. Existing sockets can
      // rejoin to refresh state after navigation, reload, or reconnect.
      if (!existingParticipant) {
        const { userId: _userId, ...publicParticipant } = participant as any;
        socket.to(`room:${room.code}`).emit('room:participant-joined', { participant: publicParticipant });
      }
      io.to(`room:${room.code}`).emit('room:participants-updated', {
        participants: roomManager.getPublicParticipants(room.code),
      });

      // Load chat history and send to the joining participant, translating any
      // messages that weren't translated into their language when originally sent.
      try {
        // Plan-capped chat history (Free = 100). Load one extra to detect that
        // more exist, then keep only the newest `messageLimit`.
        const messageLimit = planLimits(user?.plan).messages;
        const loaded = await db.getRecentMessages(room.id, messageLimit + 1);
        const truncated = loaded.length > messageLimit;
        const history = truncated ? loaded.slice(loaded.length - messageLimit) : loaded;
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
          socket.emit('room:history', { messages: formatted, truncated });
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
      participants: roomManager.getPublicParticipants(roomCode),
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
    if (participant.userId && !(await hasUsageBalance(participant.userId, 'text_words'))) {
      cb?.({ ok: false, errorCode: INSUFFICIENT_CREDITS, error: userBalanceError('text') });
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
        senderUserId:   participant.userId,
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

  // ── Chunked audio upload → assemble PCM → existing workflow ──────────────
  socket.on('message:audio:start', async ({
    sessionId,
    clientMsgId,
    senderLang: clientSenderLang,
    sampleRate,
    channels,
    encoding,
  }: any = {}, cb) => {
    const { roomCode, roomId, participant } = socket.data;
    if (!roomCode || !roomId || !participant) {
      cb?.({ ok: false, error: 'Not connected to a room.' });
      return;
    }

    const roomConfig = roomManager.get(roomCode)?.config;
    if (roomConfig && !roomConfig.input.voice) {
      cb?.({ ok: false, error: 'Voice input is disabled for this room.' });
      return;
    }
    const requestedDirectVoice = roomConfig?.voicePipeline === 'direct-voice-translation';
    const isRealtimeAllowedHere = roomConfig?.mode === 'solo_multilang' || participant.isHost;
    const usageKind = requestedDirectVoice && isRealtimeAllowedHere ? 'realtime_seconds' : 'voice_seconds';
    if (participant.userId && !(await hasUsageBalance(participant.userId, usageKind))) {
      cb?.({
        ok: false,
        errorCode: INSUFFICIENT_CREDITS,
        error: userBalanceError(usageKind === 'realtime_seconds' ? 'realtime' : 'voice'),
      });
      return;
    }
    if (encoding !== 'pcm16' || sampleRate !== STREAM_AUDIO_SAMPLE_RATE || channels !== STREAM_AUDIO_CHANNELS) {
      cb?.({ ok: false, error: 'Unsupported audio stream format.' });
      return;
    }

    const effectiveSenderLang = (typeof clientSenderLang === 'string' && clientSenderLang)
      ? clientSenderLang
      : participant.language;
    const msgId = isUuid(clientMsgId) ? clientMsgId : makeMsgId();
    const safeSessionId = isUuid(sessionId) ? sessionId : randomUUID();
    const tempPcmPath = path.join(audioUploadDir(), `${safeSessionId}.pcm`);

    cleanupAudioUploadSession(safeSessionId);
    audioUploadSessions.set(safeSessionId, {
      sessionId: safeSessionId,
      msgId,
      roomCode,
      roomId,
      socketId: socket.id,
      sender: participant.nickname,
      userId: participant.userId,
      senderLang: effectiveSenderLang,
      tempPcmPath,
      nextSeq: 0,
      bytesReceived: 0,
      startedAt: Date.now(),
      lastChunkAt: Date.now(),
      writeQueue: fs.promises.writeFile(tempPcmPath, Buffer.alloc(0)),
    });

    logger.info({
      event: 'message.audio_stream.started',
      roomCode,
      roomId,
      msgId,
      socketId: socket.id,
      sessionId: safeSessionId,
      senderLang: effectiveSenderLang,
      sampleRate,
      channels,
      encoding,
    }, 'Audio stream upload started');

    await queue.publishTranslating(roomCode, msgId);
    await queue.publishMessageProgress(roomCode, msgId, 10, 'sendingAudio');
    cb?.({ ok: true, id: msgId, sessionId: safeSessionId });
  });

  socket.on('message:audio:chunk', async ({ sessionId, seq, bytes }: any = {}, cb) => {
    const session = typeof sessionId === 'string' ? audioUploadSessions.get(sessionId) : null;
    const chunk = audioChunkBuffer(bytes);
    if (!session || session.socketId !== socket.id || !chunk) {
      cb?.({ ok: false, error: 'Unknown audio upload session.' });
      return;
    }
    if (chunk.length > STREAM_AUDIO_MAX_CHUNK_BYTES) {
      cb?.({ ok: false, error: 'Audio chunk too large.' });
      return;
    }
    if (seq !== session.nextSeq) {
      cb?.({ ok: false, error: `Unexpected audio chunk sequence. Expected ${session.nextSeq}.` });
      return;
    }

    session.nextSeq += 1;
    session.bytesReceived += chunk.length;
    session.lastChunkAt = Date.now();
    session.writeQueue = session.writeQueue.then(() => fs.promises.appendFile(session.tempPcmPath, chunk));

    try {
      await session.writeQueue;
      cb?.({ ok: true, seq });
    } catch (err: any) {
      logger.error({ event: 'message.audio_stream.chunk_failed', severity: severity.P2, sessionId, seq, err }, 'Audio stream chunk write failed');
      cleanupAudioUploadSession(sessionId);
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('message:audio:abort', ({ sessionId, reason }: any = {}) => {
    if (typeof sessionId !== 'string') return;
    const session = audioUploadSessions.get(sessionId);
    if (!session || session.socketId !== socket.id) return;
    logger.info({
      event: 'message.audio_stream.aborted',
      roomCode: session.roomCode,
      roomId: session.roomId,
      msgId: session.msgId,
      socketId: socket.id,
      sessionId,
      reason,
      audioBytes: session.bytesReceived,
    }, 'Audio stream upload aborted');
    void publishMessageError(session.roomCode, session.msgId);
    cleanupAudioUploadSession(sessionId);
  });

  socket.on('message:audio:end', async ({ sessionId, finalSeq, durationMs, durationSeconds, audioDurationMs, audioDurationSeconds }: any = {}, cb) => {
    const session = typeof sessionId === 'string' ? audioUploadSessions.get(sessionId) : null;
    if (!session || session.socketId !== socket.id) {
      cb?.({ ok: false, error: 'Unknown audio upload session.' });
      return;
    }

    const { roomCode, roomId, msgId } = session;
    const participants = roomManager.getParticipants(roomCode);
    const roomConfig = roomManager.get(roomCode)?.config;
    const senderParticipant = participants.find((p: any) => p.socketId === session.socketId) as any;
    const requestedDirectVoice = roomConfig?.voicePipeline === 'direct-voice-translation';
    const isRealtimeAllowedHere = roomConfig?.mode === 'solo_multilang' || senderParticipant?.isHost;

    try {
      if (typeof finalSeq === 'number' && finalSeq !== session.nextSeq - 1) {
        throw new Error(`Incomplete audio stream. Expected finalSeq ${session.nextSeq - 1}, received ${finalSeq}.`);
      }
      await session.writeQueue;
      if (session.bytesReceived <= 0) throw new Error('Empty audio stream.');

      const pcm = await fs.promises.readFile(session.tempPcmPath);
      const wav = pcmToWavBuffer(pcm);
      const audioBase64 = wav.toString('base64');
      const mimeType = 'audio/wav';
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
        language: session.senderLang,
      });
      appMetrics.recordAudioInput({
        roomCode,
        roomId,
        language: session.senderLang,
        seconds: audioDuration.seconds,
        source: audioDuration.source,
      });

      logger.info({
        event: 'message.audio_stream.received',
        roomCode,
        roomId,
        msgId,
        socketId: socket.id,
        sessionId,
        senderLang: session.senderLang,
        participantCount: participants.length,
        mimeType,
        audioDurationSeconds: audioDuration.seconds,
        audioDurationSource: audioDuration.source,
        audioBytes: session.bytesReceived,
        audioChunks: session.nextSeq,
      }, 'Chunked audio message received');

      dumpIncomingAudio(audioBase64, mimeType, { source: 'room-socket-stream', msgId, senderLang: session.senderLang });

      await queue.publishMessageProgress(roomCode, msgId, 25, 'received');
      await workflows.triggerTranscribe({
        msgId,
        roomCode,
        roomId,
        audioBase64,
        mimeType,
        senderLang:     session.senderLang,
        sender:         session.sender,
        senderSocketId: socket.id,
        senderUserId:   session.userId,
        audioSeconds:   audioDuration.seconds,
        participants,
        knownLanguages: roomManager.getKnownLanguages(roomCode),
        roomConfig: requestedDirectVoice && !isRealtimeAllowedHere
          ? { ...roomConfig, voicePipeline: 'stt-text-translate' }
          : roomConfig,
      });

      cb?.({ ok: true, id: msgId });
    } catch (err: any) {
      logger.error({ event: 'message.audio_stream_failed', severity: severity.P2, roomCode, roomId, msgId, socketId: socket.id, sessionId, err }, 'Chunked audio message failed');
      await publishMessageError(roomCode, msgId);
      cb?.({ ok: false, id: msgId, error: err.message });
    } finally {
      cleanupAudioUploadSession(sessionId);
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
    const requestedDirectVoice = roomConfig?.voicePipeline === 'direct-voice-translation';
    const isRealtimeAllowedHere = roomConfig?.mode === 'solo_multilang' || participant.isHost;
    const usageKind = requestedDirectVoice && isRealtimeAllowedHere ? 'realtime_seconds' : 'voice_seconds';
    if (participant.userId && !(await hasUsageBalance(participant.userId, usageKind))) {
      socket.emit('credits:exhausted', { errorCode: INSUFFICIENT_CREDITS });
      await publishMessageError(roomCode, msgId);
      return;
    }

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

      dumpIncomingAudio(audioBase64, mimeType, { source: 'room-socket', msgId, senderLang: effectiveSenderLang });

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
        senderUserId:   participant.userId,
        audioSeconds:   audioDuration.seconds,
        participants,
        knownLanguages: roomManager.getKnownLanguages(roomCode),
        roomConfig: requestedDirectVoice && !isRealtimeAllowedHere
          ? { ...roomConfig, voicePipeline: 'stt-text-translate' }
          : roomConfig,
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
    for (const [sessionId, session] of audioUploadSessions) {
      if (session.socketId === socket.id) cleanupAudioUploadSession(sessionId);
    }
    const { roomCode, participant } = socket.data;
    if (roomCode && participant) {
      roomManager.removeParticipant(roomCode, socket.id);
      io.to(`room:${roomCode}`).emit('room:participant-left', { socketId: socket.id });
      io.to(`room:${roomCode}`).emit('room:participants-updated', {
        participants: roomManager.getPublicParticipants(roomCode),
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

  // Email verification producer (Redpanda) — used by /auth/email/send-code.
  await connectEmailQueue();

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info({
      event: 'server.ready',
      port: Number(PORT),
      url: `http://localhost:${PORT}`,
      inngest: workflows.isInngestEnabled() ? 'on' : 'off',
      ...(workflows.isInngestEnabled() ? { inngestUrl: `http://localhost:${PORT}/api/inngest` } : {}),
    }, 'Server ready');
  });
}

start().catch(async (err) => {
  logger.fatal({ event: 'server.start_failed', severity: severity.P1, err }, 'Failed to start');
  await flushLogs();
  process.exit(1);
});
