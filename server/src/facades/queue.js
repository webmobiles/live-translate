'use strict';

/**
 * Queue Façade
 *
 * Single point of access for all message queue operations.
 * Business code never imports kafkajs or references Redpanda topics directly.
 * If Redpanda is replaced by NATS or RabbitMQ, only this file
 * and src/kafka/index.js change.
 */

const kafka = require('../kafka');

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function connect() {
  return kafka.connect();
}

// ── Publishing — named methods so callers never know topic names ───────────

async function publishSocketEvent(type, payload) {
  return kafka.publish(type, payload);
}

async function publishTranslating(roomCode, msgId) {
  return kafka.publish('message:translating', { roomCode, msgId });
}

async function publishMessageReady(roomCode, message) {
  return kafka.publish('message:incoming', { roomCode, message });
}

// ── Consuming ──────────────────────────────────────────────────────────────

async function startConsuming(handler) {
  return kafka.startConsuming(handler);
}

module.exports = {
  connect,
  publishSocketEvent,
  publishTranslating,
  publishMessageReady,
  startConsuming,
};
