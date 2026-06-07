'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { roomManager } = require('./rooms/manager');
const { translate, transcribe } = require('./gateway');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
});

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Helpers ────────────────────────────────────────────────────────────────

async function broadcastTranslations(io, roomCode, msgId, text, senderSocketId, senderLang) {
  const participants = roomManager.getParticipants(roomCode);

  const targetLangs = [...new Set(
    participants
      .filter(p => p.socketId !== senderSocketId)
      .map(p => p.language),
  )];

  const translations = {};
  await Promise.all(
    targetLangs.map(async (lang) => {
      try {
        translations[lang] = await translate(text, senderLang, lang);
      } catch (err) {
        console.error(`[translate] ${senderLang}→${lang} failed:`, err.message);
        translations[lang] = text;
      }
    }),
  );

  const sender = participants.find(p => p.socketId === senderSocketId);

  participants.forEach(p => {
    io.to(p.socketId).emit('message:incoming', {
      id: msgId,
      original: text,
      translated: p.socketId === senderSocketId ? text : (translations[p.language] || text),
      sender: sender?.nickname ?? 'Unknown',
      senderLang,
      targetLang: p.language,
      isMine: p.socketId === senderSocketId,
      timestamp: Date.now(),
    });
  });
}

// ── Socket handlers ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[socket] + ${socket.id}`);

  // Create room
  socket.on('room:create', ({ name, nickname, language } = {}, cb) => {
    try {
      const room = roomManager.create({ name, hostSocketId: socket.id });
      const participant = roomManager.addParticipant(room.code, {
        socketId: socket.id,
        nickname: nickname || 'Host',
        language: language || 'en',
        isHost: true,
      });
      socket.join(`room:${room.code}`);
      socket.data.roomCode = room.code;
      socket.data.participant = participant;
      console.log(`[room] created ${room.code} by ${nickname}`);
      cb?.({ ok: true, code: room.code, room: roomManager.getPublic(room.code) });
    } catch (err) {
      console.error('[room:create]', err.message);
      cb?.({ ok: false, error: err.message });
    }
  });

  // Join room
  socket.on('room:join', ({ code, nickname, language } = {}, cb) => {
    const room = roomManager.get(code);
    if (!room) {
      cb?.({ ok: false, error: 'Room not found. Check the code and try again.' });
      return;
    }
    const participant = roomManager.addParticipant(code.toUpperCase(), {
      socketId: socket.id,
      nickname: nickname || 'Guest',
      language: language || 'en',
      isHost: false,
    });
    socket.join(`room:${code.toUpperCase()}`);
    socket.data.roomCode = code.toUpperCase();
    socket.data.participant = participant;

    socket.to(`room:${code.toUpperCase()}`).emit('room:participant-joined', { participant });
    io.to(`room:${code.toUpperCase()}`).emit('room:participants-updated', {
      participants: roomManager.getParticipants(code.toUpperCase()),
    });
    console.log(`[room] ${nickname} joined ${code.toUpperCase()}`);
    cb?.({ ok: true, room: roomManager.getPublic(code.toUpperCase()) });
  });

  // Text message → translate → broadcast
  socket.on('message:text', async ({ text } = {}) => {
    const { roomCode, participant } = socket.data;
    if (!roomCode || !participant || !text?.trim()) return;

    const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    io.to(`room:${roomCode}`).emit('message:translating', { id: msgId });

    try {
      await broadcastTranslations(io, roomCode, msgId, text.trim(), socket.id, participant.language);
    } catch (err) {
      console.error('[message:text]', err.message);
    }
  });

  // Audio → Whisper STT → translate → broadcast
  socket.on('message:audio', async ({ audioBase64, mimeType } = {}) => {
    const { roomCode, participant } = socket.data;
    if (!roomCode || !participant || !audioBase64) return;

    const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    io.to(`room:${roomCode}`).emit('message:translating', { id: msgId });

    try {
      const text = await transcribe(audioBase64, mimeType, participant.language);
      if (!text?.trim()) {
        socket.emit('message:error', { id: msgId, error: 'Could not transcribe audio' });
        return;
      }
      await broadcastTranslations(io, roomCode, msgId, text.trim(), socket.id, participant.language);
    } catch (err) {
      console.error('[message:audio]', err.message);
      socket.emit('message:error', { id: msgId, error: 'Audio processing failed' });
    }
  });

  // Disconnect
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

// Stale room cleanup every 30 min
setInterval(() => roomManager.cleanStale(2 * 60 * 60 * 1000), 30 * 60 * 1000);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`\n🌐 LiveTranslate server → http://localhost:${PORT}\n`);
});
