'use strict';

const { connect: connectNats, StringCodec } = require('nats');

const SERVERS = (process.env.NATS_SERVERS || 'nats://localhost:4222')
  .split(',')
  .map(server => server.trim())
  .filter(Boolean);

const SUBJECT = process.env.NATS_SOCKET_SUBJECT || 'live-translate.socket-broadcast';
const SERVER_ID = process.env.SERVER_ID || Math.random().toString(36).slice(2, 8);

const codec = StringCodec();

let nc;

async function connect() {
  if (nc && !nc.isClosed()) return;

  nc = await connectNats({
    servers: SERVERS,
    name: `live-translate-${SERVER_ID}`,
  });

  nc.closed()
    .then(err => {
      if (err) console.error('[nats] connection closed with error:', err.message);
    })
    .catch(err => console.error('[nats] closed handler failed:', err.message));

  console.log(`[nats] connected — ${SERVERS.join(', ')}`);
}

async function publish(type, payload) {
  if (!nc || nc.isClosed()) await connect();

  nc.publish(SUBJECT, codec.encode(JSON.stringify({ type, ...payload })));
}

async function startConsuming(handler) {
  if (!nc || nc.isClosed()) await connect();

  const sub = nc.subscribe(SUBJECT);
  console.log(`[nats] subscribed — ${SUBJECT}`);

  (async () => {
    for await (const msg of sub) {
      try {
        const data = JSON.parse(codec.decode(msg.data));
        await handler(data);
      } catch (err) {
        console.error('[nats] failed to process message:', err.message);
      }
    }
  })().catch(err => console.error('[nats] subscriber failed:', err.message));
}

module.exports = { connect, publish, startConsuming };

export {};
