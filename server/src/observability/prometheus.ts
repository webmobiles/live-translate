'use strict';

const client = require('prom-client');

const collectDefaultMetrics = client.collectDefaultMetrics;
const register = client.register;

collectDefaultMetrics({
  prefix: 'live_translate_server_',
});

async function metricsHandler(_req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  metricsHandler,
};

export {};
