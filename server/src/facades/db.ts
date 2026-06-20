/**
 * Database Façade
 *
 * Single point of access for all database operations.
 * Business code never imports database-specific drivers directly.
 * Switch room/message providers with
 * DB_PROVIDER_ROOM=scylla|tikv|surreal|postgres.
 */

import * as scylla from '../db/scylla';
import * as tikv from '../db/tikv';
import * as surreal from '../db/surreal';
import * as postgres from '../db/postgres';

const PROVIDERS: Record<string, typeof scylla> = { scylla, tikv, surreal, postgres };

function getProvider() {
  const name = (process.env.DB_PROVIDER_ROOM || 'postgres').trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown DB_PROVIDER_ROOM: "${name}". Valid: scylla, tikv, surreal, postgres`);
  return provider;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export async function connect() {
  return getProvider().connect();
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoom({ code, name }: { code: string; name: string }) {
  return getProvider().createRoom({ code, name });
}

export async function getRoomByCode(code: string) {
  return getProvider().getRoomByCode(code);
}

export async function updateRoomConfig(roomId: string, config: any) {
  return getProvider().updateRoomConfig(roomId, config);
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function saveMessage(payload: any) {
  return getProvider().saveMessage(payload);
}

export async function getRecentMessages(roomId: string, limit = 100) {
  return getProvider().getRecentMessages(roomId, limit);
}

export async function addMessageTranslations(roomId: string, msgId: string, timestamp: number, newTranslations: Record<string, string>) {
  return getProvider().addMessageTranslations(roomId, msgId, timestamp, newTranslations);
}

export async function ping() {
  return getProvider().ping();
}
