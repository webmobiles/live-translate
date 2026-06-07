'use strict';

const db = require('../facades/db');

// In-memory participant state — who is currently connected.
// Rooms and messages are persisted via the db façade.
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

  async create({ name }) {
    const code     = generateCode();
    const roomName = name || `Room ${code}`;
    const dbRoom   = await db.createRoom({ code, name: roomName });

    rooms.set(code, {
      id:           dbRoom.id,
      code,
      name:         roomName,
      createdAt:    dbRoom.createdAt,
      participants: new Map(),
    });

    console.log(`[room] created ${code} (id: ${dbRoom.id})`);
    return rooms.get(code);
  },

  // Get from memory, or restore from DB if server restarted
  async getOrRestore(code) {
    const upper = code?.toUpperCase();
    if (rooms.has(upper)) return rooms.get(upper);

    const dbRoom = await db.getRoomByCode(upper);
    if (!dbRoom) return null;

    rooms.set(upper, {
      id:           dbRoom.id,
      code:         upper,
      name:         dbRoom.name,
      createdAt:    dbRoom.createdAt,
      participants: new Map(),
    });

    console.log(`[room] restored ${upper} from DB`);
    return rooms.get(upper);
  },

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
  },

  updateParticipantLanguage(code, socketId, language) {
    const room = this.get(code);
    const p    = room?.participants.get(socketId);
    if (p) p.language = language;
  },

  getParticipants(code) {
    return Array.from(this.get(code)?.participants.values() ?? []);
  },

  getPublic(code) {
    const room = this.get(code);
    if (!room) return null;
    return { id: room.id, code: room.code, name: room.name, participants: this.getParticipants(code), createdAt: room.createdAt };
  },
};

module.exports = { roomManager };
