import { connect as connectNats, StringCodec } from 'nats';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';

const SERVERS = (process.env.NATS_SERVERS || 'nats://localhost:4222')
  .split(',')
  .map(server => server.trim())
  .filter(Boolean);

const SUBJECT = process.env.NATS_SOCKET_SUBJECT || 'live-translate.socket-broadcast';
const SERVER_ID = process.env.SERVER_ID || Math.random().toString(36).slice(2, 8);

const codec = StringCodec();

let nc: Awaited<ReturnType<typeof connectNats>> | undefined;

export async function connect() {
  if (nc && !nc.isClosed()) return;

  nc = await connectNats({
    servers: SERVERS,
    name: `live-translate-${SERVER_ID}`,
  });

  nc.closed()
    .then(err => {
      if (err) logger.error({ event: 'queue.nats_closed', severity: severity.P2, err }, 'NATS connection closed with error');
    })
    .catch(err => logger.error({ event: 'queue.nats_close_handler_failed', severity: severity.P3, err }, 'NATS close handler failed'));

  logger.info({ event: 'queue.connected', provider: 'nats', servers: SERVERS }, 'NATS connected');
}

export async function publish(type: string, payload: Record<string, unknown>) {
  if (!nc || nc.isClosed()) await connect();

  nc!.publish(SUBJECT, codec.encode(JSON.stringify({ type, ...payload })));
}

export async function startConsuming(handler: (data: any) => Promise<void>) {
  if (!nc || nc.isClosed()) await connect();

  const sub = nc!.subscribe(SUBJECT);
  logger.info({ event: 'queue.subscribed', provider: 'nats', subject: SUBJECT }, 'NATS subscribed');

  (async () => {
    for await (const msg of sub) {
      try {
        const data = JSON.parse(codec.decode(msg.data));
        await handler(data);
      } catch (err) {
        logger.error({ event: 'queue.message_process_failed', severity: severity.P2, provider: 'nats', subject: SUBJECT, err }, 'NATS message processing failed');
      }
    }
  })().catch(err => logger.error({ event: 'queue.subscriber_failed', severity: severity.P2, provider: 'nats', subject: SUBJECT, err }, 'NATS subscriber failed'));
}

export async function ping() {
  if (!nc) throw new Error('[nats] not connected');
  await nc.flush();
}
