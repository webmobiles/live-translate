'use strict';

const { Kafka, Partitioners, logLevel } = require('kafkajs');

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
const GROUP_ID = `live-translate-socket-${process.env.SERVER_ID || Math.random().toString(36).slice(2, 8)}`;

const consumer = kafka.consumer({ groupId: GROUP_ID });

const TOPIC = 'live-translate.socket-broadcast';

async function connect() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[kafka] connected — group ${GROUP_ID}`);
}

// Publish an event that all Socket.io servers should broadcast
async function publish(type, payload) {
  await producer.send({
    topic: TOPIC,
    messages: [{ value: JSON.stringify({ type, ...payload }) }],
  });
}

// Register a handler called for every message received from Redpanda
// handler(parsedMessage) — called on every Socket.io server instance
async function startConsuming(handler) {
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value.toString());
        await handler(data);
      } catch (err) {
        console.error('[kafka] failed to process message:', err.message);
      }
    },
  });
}

module.exports = { connect, publish, startConsuming };
