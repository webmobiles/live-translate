'use strict';

/**
 * Queue Façade
 *
 * Single point of access for all message queue operations.
 * Business code never imports broker clients or references subjects/topics directly.
 * The concrete provider is selected by QUEUE_PROVIDER.
 */

const kafka = require('../kafka');
const nats = require('../nats');

const providers = {
  redpanda: kafka,
  kafka,
  nats,
};

function getProviderName() {
  return (process.env.QUEUE_PROVIDER || 'nats').trim().toLowerCase();
}

function getProvider() {
  const providerName = getProviderName();
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown QUEUE_PROVIDER: "${providerName}". Valid: nats, redpanda`);
  }
  return provider;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function connect() {
  return getProvider().connect();
}

// ── Publishing — named methods so callers never know topic names ───────────

async function publishSocketEvent(type, payload) {
  return getProvider().publish(type, payload);
}

async function publishTranslating(roomCode, msgId) {
  return getProvider().publish('message:translating', { roomCode, msgId });
}

async function publishMessageReady(roomCode, message) {
  return getProvider().publish('message:incoming', { roomCode, message });
}

// ── Consuming ──────────────────────────────────────────────────────────────

async function startConsuming(handler) {
  return getProvider().startConsuming(handler);
}

async function ping() {
  return getProvider().ping();
}

module.exports = {
  connect,
  ping,
  publishSocketEvent,
  publishTranslating,
  publishMessageReady,
  startConsuming,
};

export {};
