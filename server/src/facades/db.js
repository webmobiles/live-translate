'use strict';

/**
 * Database Façade
 *
 * Single point of access for all database operations.
 * Business code never imports database-specific drivers directly.
 * Switch providers with DB_PROVIDER=scylla|tikv|surreal.
 */

const PROVIDERS = {
  scylla: require('../db/scylla'),
  tikv: require('../db/tikv'),
  surreal: require('../db/surreal'),
};

function getProvider() {
  const name = (process.env.DB_PROVIDER || 'scylla').trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown DB_PROVIDER: "${name}". Valid: scylla, tikv, surreal`);
  return provider;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function connect() {
  return getProvider().connect();
}

// ── Rooms ──────────────────────────────────────────────────────────────────

async function createRoom({ code, name }) {
  return getProvider().createRoom({ code, name });
}

async function getRoomByCode(code) {
  return getProvider().getRoomByCode(code);
}

async function updateRoomConfig(roomId, config) {
  return getProvider().updateRoomConfig(roomId, config);
}

// ── Messages ───────────────────────────────────────────────────────────────

async function saveMessage(payload) {
  return getProvider().saveMessage(payload);
}

async function getRecentMessages(roomId, limit = 100) {
  return getProvider().getRecentMessages(roomId, limit);
}

module.exports = { connect, createRoom, getRoomByCode, updateRoomConfig, saveMessage, getRecentMessages };
