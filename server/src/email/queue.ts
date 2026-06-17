/**
 * Email verification queue (Redpanda producer).
 *
 * A dedicated Kafka/Redpanda producer for the registration-code work queue.
 * This is deliberately separate from src/kafka (the socket-broadcast bus): that
 * one fans every message out to every server, which would send duplicate
 * emails. Here a single topic is consumed by the emailWorker with a fixed
 * consumer group, so each code email is sent exactly once.
 *
 * Always talks to Redpanda directly, regardless of QUEUE_PROVIDER.
 */

import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';

const BROKERS = (process.env.REDPANDA_BROKERS || 'localhost:19092').split(',');
const TOPIC = process.env.EMAIL_VERIFICATION_TOPIC || 'email.verification';

const kafka = new Kafka({
  clientId: 'live-translate-email-producer',
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: true,
});

let connected = false;

export async function connectEmailQueue() {
  if (connected) return;
  await producer.connect();
  connected = true;
  logger.info({ event: 'email_queue.connected', brokers: BROKERS, topic: TOPIC }, 'Email queue (Redpanda) connected');
}

export interface VerificationEmailJob {
  preuserId: string;
  email: string;
  code: string;
}

/**
 * Enqueues one verification-code email. The plaintext code is carried in the
 * message (the DB stores only its hash) so the worker can render the email
 * without a database round-trip. `email` is used as the partition key so
 * repeated requests for the same address stay ordered.
 */
export async function publishVerificationEmail(job: VerificationEmailJob) {
  try {
    await producer.send({
      topic: TOPIC,
      messages: [{ key: job.email, value: JSON.stringify(job) }],
    });
  } catch (err) {
    logger.error({ event: 'email_queue.publish_failed', severity: severity.P2, topic: TOPIC, err }, 'Failed to enqueue verification email');
    throw err;
  }
}

export async function disconnectEmailQueue() {
  if (!connected) return;
  await producer.disconnect().catch(() => {});
  connected = false;
}
