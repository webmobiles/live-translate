'use strict';

const { Inngest } = require('inngest');

const inngestBaseUrl = process.env.INNGEST_BASE_URL || 'http://localhost:8288';
const inngestEventKey = process.env.INNGEST_EVENT_KEY || 'local';
const explicitDevMode = process.env.INNGEST_DEV;
const isLocalInngest = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(inngestBaseUrl)
  && inngestEventKey === 'local';

const inngest = new Inngest({
  id: 'live-translate',
  eventKey: inngestEventKey,
  isDev: explicitDevMode === undefined
    ? isLocalInngest
    : ['1', 'true'].includes(explicitDevMode.trim().toLowerCase()),
  // In local dev, send events to the local Inngest dev server instead of cloud.
  baseUrl: inngestBaseUrl,
});

module.exports = { inngest };

export {};
