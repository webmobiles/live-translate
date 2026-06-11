'use strict';

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  override: false,
});

const { logger } = require('./logger');
const { severity } = require('./severity');

const otelEnabled = process.env.OTEL_ENABLED === 'true' || Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

if (otelEnabled) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

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

export {};
