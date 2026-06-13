import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(__dirname, '..', '..', '.env'),
  override: false,
});

import { logger } from './logger';
import { severity } from './severity';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const otelEnabled = process.env.OTEL_ENABLED === 'true' || Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

if (otelEnabled) {
  const baseEndpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:5080/api/default').replace(/\/$/, '');
  const traceEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${baseEndpoint}/v1/traces`;
  const metricEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${baseEndpoint}/v1/metrics`;
  const headers = (process.env.OTEL_EXPORTER_OTLP_HEADERS || '')
    .split(',')
    .reduce((parsed, pair) => {
      const [rawKey, ...rawValue] = pair.split('=');
      const key = rawKey?.trim();
      const value = rawValue.join('=').trim();
      if (key && value) parsed[key] = value;
      return parsed;
    }, {} as Record<string, string>);

  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: metricEndpoint, headers }),
    exportIntervalMillis: Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || '15000', 10),
  });

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'live-translate-server',
    traceExporter: new OTLPTraceExporter({ url: traceEndpoint, headers }),
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  logger.info(
    {
      event: 'otel.started',
      traceEndpoint,
      metricEndpoint,
    },
    'OpenTelemetry started',
  );

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => logger.info({ event: 'otel.stopped' }, 'OpenTelemetry stopped'))
      .catch((err) => logger.error({ event: 'otel.stop_failed', severity: severity.P3, err }, 'OpenTelemetry shutdown failed'));
  });
}
