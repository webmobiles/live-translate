/**
 * Queue Façade
 *
 * Single point of access for all message queue operations.
 * Business code never imports broker clients or references subjects/topics directly.
 * The concrete provider is selected by QUEUE_PROVIDER.
 */

import * as kafka from '../kafka';
import * as nats from '../nats';

const providers: Record<string, typeof kafka> = {
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

export async function connect() {
  return getProvider().connect();
}

// ── Publishing — named methods so callers never know topic names ───────────

export async function publishSocketEvent(type: string, payload: Record<string, unknown>) {
  return getProvider().publish(type, payload);
}

export async function publishTranslating(roomCode: string, msgId: string) {
  return getProvider().publish('message:translating', { roomCode, msgId });
}

export async function publishMessageProgress(roomCode: string, msgId: string, progress: number, stage?: string) {
  return getProvider().publish('message:progress', { roomCode, msgId, progress, stage });
}

export async function publishMessageReady(roomCode: string, message: Record<string, unknown>) {
  return getProvider().publish('message:incoming', { roomCode, message });
}

// ── Consuming ──────────────────────────────────────────────────────────────

export async function startConsuming(handler: (data: any) => Promise<void>) {
  return getProvider().startConsuming(handler);
}

export async function ping() {
  return getProvider().ping();
}
