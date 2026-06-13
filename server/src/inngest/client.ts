import { Inngest } from 'inngest';

const inngestBaseUrl = process.env.INNGEST_BASE_URL || 'http://localhost:8288';
const inngestEventKey = process.env.INNGEST_EVENT_KEY || 'local';
const explicitDevMode = process.env.INNGEST_DEV;
const isLocalInngest = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(inngestBaseUrl)
  && inngestEventKey === 'local';

export const inngest = new Inngest({
  id: 'live-translate',
  eventKey: inngestEventKey,
  isDev: explicitDevMode === undefined
    ? isLocalInngest
    : ['1', 'true'].includes(explicitDevMode.trim().toLowerCase()),
  baseUrl: inngestBaseUrl,
});
