/**
 * Email worker — standalone process.
 *
 * Consumes the registration-code work queue from Redpanda and sends each code
 * via AWS SES. Runs as its own process (npm run worker:email), separate from
 * the API server, and uses a FIXED consumer group so every message is handled
 * exactly once even if multiple workers run. This is the live-translate
 * equivalent of pelemobil's sendemail-service.js.
 */

import '../env'; // load .env before anything reads process.env
import { Kafka, logLevel } from 'kafkajs';
import { logger, flushLogs } from '../observability/logger';
import { severity } from '../observability/severity';
import { sendVerificationCodeEmail } from '../email/ses';

const BROKERS = (process.env.REDPANDA_BROKERS || 'localhost:19092').split(',');
const TOPIC = process.env.EMAIL_VERIFICATION_TOPIC || 'email.verification';
const GROUP_ID = 'live-translate-email';

const kafka = new Kafka({
  clientId: 'live-translate-email-worker',
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

async function handleMessage(raw: string) {
  let job: { preuserId?: string; email?: string; code?: string };
  try {
    job = JSON.parse(raw);
  } catch (err) {
    logger.error({ event: 'email_worker.bad_message', severity: severity.P3, err }, 'Skipping unparseable email job');
    return;
  }

  if (!job.email || !job.code) {
    logger.warn({ event: 'email_worker.incomplete_job', preuserId: job.preuserId }, 'Email job missing email or code');
    return;
  }

  try {
    const res = await sendVerificationCodeEmail(job.email, job.code);
    logger.info(
      { event: 'email_worker.sent', preuserId: job.preuserId, email: job.email, messageId: (res as any)?.MessageId },
      'Verification code email sent',
    );
  } catch (err) {
    // Throw so kafkajs does not commit the offset and the message is retried.
    logger.error({ event: 'email_worker.send_failed', severity: severity.P2, preuserId: job.preuserId, email: job.email, err }, 'Failed to send verification email');
    throw err;
  }
}

async function start() {
  logger.info({ event: 'email_worker.starting', brokers: BROKERS, topic: TOPIC, groupId: GROUP_ID }, 'Email worker starting');
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString();
      if (value) await handleMessage(value);
    },
  });
  logger.info({ event: 'email_worker.ready' }, 'Email worker ready');
}

async function shutdown(signal: string) {
  logger.info({ event: 'email_worker.shutdown', signal }, 'Email worker shutting down');
  await consumer.disconnect().catch(() => {});
  await flushLogs().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (err) => {
  logger.fatal({ event: 'email_worker.start_failed', severity: severity.P1, err }, 'Email worker failed to start');
  await flushLogs().catch(() => {});
  process.exit(1);
});
