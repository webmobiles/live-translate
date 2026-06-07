'use strict';

const scylla = require('../db/scylla');

// In-memory store — tracks currently connected participants only.
// Rooms and messages are persisted in ScyllaDB.
const rooms = new Map(); // code → { id, code, name, createdAt, participants: Map }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const roomManager = {

  // Create a new room — persisted to ScyllaDB immediately
  async create({ name, hostSocketId }) {
    const code = generateCode();
    const roomName = name || `Room ${code}`;

    const dbRoom = await scylla.createRoom({ code, name: roomName });

    rooms.set(code, {
      id:          dbRoom.id,
      code,
      name:        roomName,
      createdAt:   dbRoom.createdAt,
      participants: new Map(),
    });

    console.log(`[room] created ${code} (id: ${dbRoom.id})`);
    return rooms.get(code);
  },

  // Get room from memory, or reload from ScyllaDB if server restarted
  async getOrRestore(code) {
    const upper = code?.toUpperCase();
    if (rooms.has(upper)) return rooms.get(upper);

    // Server may have restarted — try ScyllaDB
    const dbRoom = await scylla.getRoomByCode(upper);
    if (!dbRoom) return null;

    rooms.set(upper, {
      id:           dbRoom.id,
      code:         upper,
      name:         dbRoom.name,
      createdAt:    dbRoom.createdAt,
      participants: new Map(),
    });

    console.log(`[room] restored ${upper} from ScyllaDB`);
    return rooms.get(upper);
  },

  // Sync get — only memory (use getOrRestore when handling join)
  get(code) {
    return rooms.get(code?.toUpperCase()) || null;
  },

  addParticipant(code, { socketId, nickname, language, isHost }) {
    const room = this.get(code);
    if (!room) throw new Error('Room not found');
    const participant = { socketId, nickname, language, isHost, joinedAt: Date.now() };
    room.participants.set(socketId, participant);
    return participant;
  },

  removeParticipant(code, socketId) {
    const room = this.get(code);
    if (!room) return;
    room.participants.delete(socketId);
    // Keep the room in memory even if empty — history is in ScyllaDB
  },

  updateParticipantLanguage(code, socketId, language) {
    const room = this.get(code);
    if (!room) return;
    const p = room.participants.get(socketId);
    if (p) p.language = language;
  },

  getParticipants(code) {
    const room = this.get(code);
    return room ? Array.from(room.participants.values()) : [];
  },

  getPublic(code) {
    const room = this.get(code);
    if (!room) return null;
    return {
      id:           room.id,
      code:         room.code,
      name:         room.name,
      participants: this.getParticipants(code),
      createdAt:    room.createdAt,
    };
  },
};

module.exports = { roomManager };
