import * as db from '../facades/db';
import { normalizeRoomConfig } from './config';
import { logger } from '../observability/logger';

// In-memory participant state — who is currently connected.
// Rooms and messages are persisted via the db façade.
const rooms = new Map<string, any>(); // code → { id, code, name, createdAt, participants: Map }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export const roomManager = {

  async create({ name, config }: { name?: string; config?: any }) {
    const code     = generateCode();
    const roomName = name || `Room ${code}`;
    const roomConfig = normalizeRoomConfig(config);
    const dbRoom   = await db.createRoom({ code, name: roomName });

    rooms.set(code, {
      id:             dbRoom.id,
      code,
      name:           roomName,
      createdAt:      dbRoom.createdAt,
      config:         dbRoom.config || roomConfig,
      knownLanguages: new Set<string>(),
      participants:   new Map(),
    });

    logger.info({ event: 'room.persisted', roomCode: code, roomId: dbRoom.id }, 'Room persisted');
    return rooms.get(code);
  },

  // Get from memory, or restore from DB if server restarted
  async getOrRestore(code: string) {
    const upper = code?.toUpperCase();
    if (rooms.has(upper)) return rooms.get(upper);

    const dbRoom = await db.getRoomByCode(upper);
    if (!dbRoom) return null;

    const rawConfig = dbRoom.config || {};
    rooms.set(upper, {
      id:             dbRoom.id,
      code:           upper,
      name:           dbRoom.name,
      createdAt:      dbRoom.createdAt,
      config:         normalizeRoomConfig(rawConfig),
      knownLanguages: new Set<string>((rawConfig as any).knownLanguages || []),
      participants:   new Map(),
    });

    logger.info({ event: 'room.restored', roomCode: upper, roomId: dbRoom.id }, 'Room restored from database');
    return rooms.get(upper);
  },

  get(code: string) {
    return rooms.get(code?.toUpperCase()) || null;
  },

  addParticipant(code: string, { socketId, nickname, language, isHost }: any) {
    const room = this.get(code);
    if (!room) throw new Error('Room not found');
    const participant = { socketId, nickname, language, isHost, joinedAt: Date.now() };
    room.participants.set(socketId, participant);

    if (language && !room.knownLanguages.has(language)) {
      room.knownLanguages.add(language);
      // Persist async — do not block join
      db.updateRoomConfig(room.id, { ...room.config, knownLanguages: [...room.knownLanguages] }).catch(
        (err: Error) => logger.warn({ event: 'room.knownLanguages.persist_failed', roomCode: code, language, err }, 'Failed to persist knownLanguages'),
      );
    }

    return participant;
  },

  removeParticipant(code: string, socketId: string) {
    const room = this.get(code);
    if (!room) return;
    room.participants.delete(socketId);
  },

  updateParticipantLanguage(code: string, socketId: string, language: string) {
    const room = this.get(code);
    const p    = room?.participants.get(socketId);
    if (p) p.language = language;
  },

  async updateConfig(code: string, config: any) {
    const room = this.get(code);
    if (!room) throw new Error('Room not found');
    const normalized = normalizeRoomConfig(config);
    const persisted  = await db.updateRoomConfig(room.id, { ...normalized, knownLanguages: [...room.knownLanguages] });
    room.config = normalized;
    return room.config;
  },

  getKnownLanguages(code: string): string[] {
    return [...(this.get(code)?.knownLanguages ?? [])];
  },

  getParticipants(code: string) {
    return Array.from(this.get(code)?.participants.values() ?? []);
  },

  getPublic(code: string) {
    const room = this.get(code);
    if (!room) return null;
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      config: room.config,
      participants: this.getParticipants(code),
      createdAt: room.createdAt,
    };
  },
};
