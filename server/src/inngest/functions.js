'use strict';

const { inngest }  = require('./client');
const db           = require('../facades/db');
const queue        = require('../facades/queue');
const ai           = require('../facades/ai');

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildTranslations(text, senderLang, targetLangs) {
  const unique = [...new Set(targetLangs.filter(l => l !== senderLang))];
  const entries = await Promise.all(
    unique.map(async lang => [lang, await ai.translate(text, senderLang, lang)]),
  );
  return Object.fromEntries([[senderLang, text], ...entries]);
}

// ── Function 1: translate text message ────────────────────────────────────

const translateMessage = inngest.createFunction(
  {
    id: 'translate-message',
    retries: 3,
    triggers: [{ event: 'message/translate' }],
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, text, senderLang, sender, participants } = event.data;
    const targetLangs = participants.map(p => p.language);

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: false }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId, sender, senderLang, original: text, translations, isAudio: false, timestamp: Date.now(),
      }),
    );

    return { ok: true, msgId };
  },
);

// ── Function 2: transcribe audio then translate ───────────────────────────

const transcribeAndTranslate = inngest.createFunction(
  {
    id: 'transcribe-and-translate',
    retries: 3,
    triggers: [{ event: 'message/transcribe' }],
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, participants } = event.data;
    const targetLangs = participants.map(p => p.language);

    const text = await step.run('transcribe-audio', async () => {
      const result = await ai.transcribe(audioBase64, mimeType, senderLang);
      if (!result?.trim()) throw new Error('Empty transcription');
      return result.trim();
    });

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: true }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId, sender, senderLang, original: text, translations, isAudio: true, timestamp: Date.now(),
      }),
    );

    return { ok: true, msgId, text };
  },
);

module.exports = { translateMessage, transcribeAndTranslate };
