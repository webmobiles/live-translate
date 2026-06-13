import '../env';
import pino from 'pino';
import pretty from 'pino-pretty';
import { createLogGatewayStream } from './logGateway';
import { createSlackAlertStream } from './slackGateway';

const isProduction = process.env.NODE_ENV === 'production';
const prettyLogs = process.env.LOG_PRETTY !== 'false' && !isProduction;

const base = {
  service: process.env.OTEL_SERVICE_NAME || 'live-translate-server',
  env: process.env.NODE_ENV || 'development',
};

const redact = {
  paths: [
    'OPENAI_API_KEY',
    'OPENOBSERVE_PASSWORD',
    'OPENOBSERVE_TOKEN',
    'LOKI_TOKEN',
    '*.authorization',
    '*.password',
    '*.token',
    '*.apiKey',
    '*.api_key',
    '*.audioBase64',
    'audioBase64',
  ],
  censor: '[redacted]',
};

const screenLevel = process.env.LOG_SCREEN_LEVEL || process.env.LOG_LEVEL || 'info';

const streams: any[] = [
  {
    level: screenLevel,
    stream: prettyLogs
      ? pretty({
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        })
      : process.stdout,
  },
];

const logGatewayStream = createLogGatewayStream();
if (logGatewayStream) {
  streams.push({ stream: logGatewayStream });
}

const slackAlertStream = createSlackAlertStream();
if (slackAlertStream) {
  // level: 50 = error — only P1/P2 logs are error or fatal anyway
  // level: 50 = error — only P1/P2 logs are error or fatal anyway
  streams.push({ level: 'error', stream: slackAlertStream });
}

// Human-readable label for the numeric pino level.
// This is a technical field — it never touches the `severity` business field.
const LEVEL_LABEL: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base,
    redact,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string, number: number) {
        return {
          level: number,
          levelLabel: LEVEL_LABEL[number] ?? label.toUpperCase(),
        };
      },
    },
  },
  pino.multistream(streams),
);

export function child(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export async function flushLogs() {
  await logGatewayStream?.flush?.();
}
