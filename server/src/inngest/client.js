'use strict';

const { Inngest } = require('inngest');

const inngest = new Inngest({
  id: 'live-translate',
  eventKey: process.env.INNGEST_EVENT_KEY || 'local',
  // In local dev, send events to the local Inngest dev server instead of cloud.
  baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:8288',
});

module.exports = { inngest };
