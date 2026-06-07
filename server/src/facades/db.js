'use strict';

/**
 * Database Façade
 *
 * Single point of access for all database operations.
 * Business code never imports cassandra-driver or scylla directly —
 * only this file does. If ScyllaDB is replaced by Postgres or MongoDB
 * tomorrow, only this file and src/db/scylla.js change.
 */

const scylla = require('../db/scylla');

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function connect() {
  return scylla.connect();
}

// ── Rooms ──────────────────────────────────────────────────────────────────

async function createRoom({ code, name }) {
  return scylla.createRoom({ code, name });
}

async function getRoomByCode(code) {
  return scylla.getRoomByCode(code);
}

// ── Messages ───────────────────────────────────────────────────────────────

async function saveMessage(payload) {
  return scylla.saveMessage(payload);
}

async function getRecentMessages(roomId, limit = 100) {
  return scylla.getRecentMessages(roomId, limit);
}

module.exports = { connect, createRoom, getRoomByCode, saveMessage, getRecentMessages };
