'use strict';

const path = require('path');
const { randomUUID } = require('crypto');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: process.env.NODE_ENV !== 'production',
});

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { roomManager } = require('./rooms/manager');
const { normalizeRoomConfig } = require('./rooms/config');
const db              = require('./facades/db');
const queue           = require('./facades/queue');
const workflows       = require('./facades/workflows');
const realtime        = require('./facades/realtime');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
});

// ── Inngest HTTP handler ───────────────────────────────────────────────────
// Inngest calls this endpoint to trigger and progress workflow steps.
app.use('/api/inngest', workflows.httpHandler());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', uptime: process.uptime() }),
);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMsgId() {
  return randomUUID();
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Emit a socket event to every client in a room on THIS server instance.
// All server instances do this when they receive the broadcast from the queue.
function emitToRoom(roomCode, event, payload) {
  io.to(`room:${roomCode}`).emit(event, payload);
}

// ── Read-receipt tracking (in-memory, single server) ──────────────────────
// msgId → { senderSocketId, needed: number, readers: Set<socketId> }
const pendingReads = new Map();

async function publishMessageError(roomCode, msgId) {
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

    if (type === 'message:incoming') {
      // Each client receives only the translation for their language
      const room = roomManager.get(roomCode);
      if (!room) return;

      const participants = roomManager.getParticipants(roomCode);
      const others = participants.filter(p => p.socketId !== message.senderSocketId);

      participants.forEach((participant) => {
        const translated = message.translations[participant.language]
          ?? message.translations[message.senderLang]
          ?? message.original;
        const translatedAudio = message.audioOutputs?.[participant.language]
          ?? message.audioOutputs?.[message.senderLang]
          ?? null;

        io.to(participant.socketId).emit('message:incoming', {
          id:         message.id,
          original:   message.original,
          translated,
          sender:     message.sender,
          senderLang: message.senderLang,
          targetLang: participant.language,
          isMine:     participant.socketId === message.senderSocketId,
          isAudio:    message.isAudio,
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
  console.log(`[socket] + ${socket.id}`);

  // ── Create room ──────────────────────────────────────────────────────────
  socket.on('room:create', async ({ name, nickname, language, config }: any = {}, cb) => {
    try {
      const room = await roomManager.create({ name, config: normalizeRoomConfig(config), hostSocketId: socket.id });
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

      console.log(`[room] created ${room.code} (uuid: ${room.id}) by ${nickname}`);
      cb?.({ ok: true, code: room.code, room: roomManager.getPublic(room.code) });
    } catch (err) {
      console.error('[room:create]', err.message);
      cb?.({ ok: false, error: err.message });
    }
  });

  // ── Join room ────────────────────────────────────────────────────────────
  socket.on('room:join', async ({ code, nickname, language }: any = {}, cb) => {
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
        isHost:   existingParticipant?.isHost || false,
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

      // Load chat history from ScyllaDB and send to the joining user
      try {
        const history = await db.getRecentMessages(room.id, 100);
        if (history.length > 0) {
          const formatted = history.map(msg => ({
            id:         msg.id,
            original:   msg.original,
            translated: msg.translations[language] ?? msg.translations[msg.senderLang] ?? msg.original,
            sender:     msg.sender,
            senderLang: msg.senderLang,
            targetLang: language || 'en',
            isMine:     false,
            isAudio:    msg.isAudio,
            translatedAudio: null,
            timestamp:  msg.timestamp,
          }));
          socket.emit('room:history', { messages: formatted });
        }
      } catch (err) {
        console.error('[room:join] failed to load history:', err.message);
      }

      console.log(`[room] ${nickname} joined ${room.code}`);
      cb?.({ ok: true, room: roomManager.getPublic(room.code) });
    } catch (err) {
      console.error('[room:join]', err.message);
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
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  // ── Text message → queue + Inngest ───────────────────────────────────────
  socket.on('message:text', async ({ text, clientMsgId }: any = {}, cb) => {
    const { roomCode, roomId, participant } = socket.data;
    if (!roomCode || !participant || !text?.trim()) {
      cb?.({ ok: false, error: 'Not connected to a room.' });
      return;
    }

    const msgId        = isUuid(clientMsgId) ? clientMsgId : makeMsgId();
    const participants = roomManager.getParticipants(roomCode);
    const roomConfig   = roomManager.get(roomCode)?.config;

    if (roomConfig && !roomConfig.input.text) {
      cb?.({ ok: false, error: 'Text input is disabled for this room.' });
      return;
    }

    try {
      // 1. Immediately notify all servers to show the "translating" spinner
      await queue.publishTranslating(roomCode, msgId);

      // 2. Trigger Inngest workflow (translate → save → broadcast)
      await workflows.triggerTranslate({
        msgId,
        roomCode,
        roomId,
        text:           text.trim(),
        senderLang:     participant.language,
        sender:         participant.nickname,
        senderSocketId: socket.id,
        participants,
        roomConfig,
      });
      cb?.({ ok: true, id: msgId });
    } catch (err) {
      console.error('[message:text]', err.message);
      await publishMessageError(roomCode, msgId);
      cb?.({ ok: false, id: msgId, error: err.message });
    }
  });

  // ── Audio message → queue + Inngest ──────────────────────────────────────
  socket.on('message:audio', async ({ audioBase64, mimeType }: any = {}) => {
    const { roomCode, roomId, participant } = socket.data;
    if (!roomCode || !participant || !audioBase64) return;

    const msgId        = makeMsgId();
    const participants = roomManager.getParticipants(roomCode);
    const roomConfig   = roomManager.get(roomCode)?.config;

    if (roomConfig && !roomConfig.input.voice) return;

    try {
      // 1. Show spinner on all servers immediately
      await queue.publishTranslating(roomCode, msgId);

      // 2. Trigger Inngest workflow (transcribe → translate → save → broadcast)
      await workflows.triggerTranscribe({
        msgId,
        roomCode,
        roomId,
        audioBase64,
        mimeType,
        senderLang:     participant.language,
        sender:         participant.nickname,
        senderSocketId: socket.id,
        participants,
        roomConfig,
      });
    } catch (err) {
      console.error('[message:audio]', err.message);
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
      console.log(`[room] ${participant.nickname} left ${roomCode}`);
    }
    console.log(`[socket] - ${socket.id}`);
  });
});

// ── Startup ────────────────────────────────────────────────────────────────

async function start() {
  console.log('\n🌐 LiveTranslate — starting...\n');

  // Verify all external services are reachable before accepting traffic
  const { runHealthChecks } = require('./startup/healthCheck');
  await runHealthChecks();

  // Connect to the selected database provider
  await db.connect();

  // Connect to the selected queue and start consuming broadcast events
  await queue.connect();
  await realtime.configureSocketAdapter(io);
  await startQueueConsumer();

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`\n✅ Server ready → http://localhost:${PORT}`);
    console.log(`   Inngest handler → http://localhost:${PORT}/api/inngest\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

export {};
