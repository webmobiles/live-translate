import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';

const BROKERS = (process.env.REDPANDA_BROKERS || 'localhost:19092').split(',');

const kafka = new Kafka({
  clientId: 'live-translate',
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: true,
});

// Each server instance gets its own consumer group ID so every server
// receives every message (broadcast fan-out pattern).
// Each server instance gets its own consumer group ID so every server
// receives every message (broadcast fan-out pattern).
const GROUP_ID = `live-translate-socket-${process.env.SERVER_ID || Math.random().toString(36).slice(2, 8)}`;

const consumer = kafka.consumer({ groupId: GROUP_ID });

const TOPIC = 'live-translate.socket-broadcast';

export async function connect() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  logger.info({ event: 'queue.connected', provider: 'redpanda', brokers: BROKERS, groupId: GROUP_ID, topic: TOPIC }, 'Redpanda connected');
}

// Publish an event that all Socket.io servers should broadcast
export async function publish(type: string, payload: Record<string, unknown>) {
  await producer.send({
    topic: TOPIC,
    messages: [{ value: JSON.stringify({ type, ...payload }) }],
  });
}

// Register a handler called for every message received from Redpanda
// handler(parsedMessage) — called on every Socket.io server instance
export async function startConsuming(handler: (data: any) => Promise<void>) {
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value!.toString());
        await handler(data);
      } catch (err) {
        logger.error({ event: 'queue.message_process_failed', severity: severity.P2, provider: 'redpanda', topic: TOPIC, groupId: GROUP_ID, err }, 'Redpanda message processing failed');
      }
    },
  });
}

export async function ping() {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.listTopics();
  } finally {
    await admin.disconnect().catch(() => {});
  }
}
