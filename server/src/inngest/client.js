'use strict';

const { Inngest } = require('inngest');

const inngest = new Inngest({
  id: 'live-translate',
  // In production set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env vars.
  // In local dev with `inngest dev` running, these defaults work fine.
  eventKey: process.env.INNGEST_EVENT_KEY || 'local',
});

module.exports = { inngest };
