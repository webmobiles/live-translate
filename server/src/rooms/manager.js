'use strict';

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const roomManager = {
  create({ name, hostSocketId }) {
    const code = generateCode();
    rooms.set(code, {
      code,
      name: name || `Room ${code}`,
      hostSocketId,
      participants: new Map(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    return rooms.get(code);
  },

  get(code) {
    return rooms.get(code?.toUpperCase()) || null;
  },

  addParticipant(code, { socketId, nickname, language, isHost }) {
    const room = this.get(code);
    if (!room) throw new Error('Room not found');
    const participant = { socketId, nickname, language, isHost, joinedAt: Date.now() };
    room.participants.set(socketId, participant);
    room.lastActivityAt = Date.now();
    return participant;
  },

  removeParticipant(code, socketId) {
    const room = this.get(code);
    if (!room) return;
    room.participants.delete(socketId);
    if (room.participants.size === 0) rooms.delete(code);
  },

  getParticipants(code) {
    const room = this.get(code);
    return room ? Array.from(room.participants.values()) : [];
  },

  getPublic(code) {
    const room = this.get(code);
    if (!room) return null;
    return {
      code: room.code,
      name: room.name,
      participants: this.getParticipants(code),
      createdAt: room.createdAt,
    };
  },

  cleanStale(maxAgeMs) {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - room.lastActivityAt > maxAgeMs) {
        rooms.delete(code);
        console.log(`[rooms] cleaned stale room: ${code}`);
      }
    }
  },
};

module.exports = { roomManager };
