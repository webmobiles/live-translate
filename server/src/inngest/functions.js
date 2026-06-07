'use strict';

const { inngest }               = require('./client');
const { translate, transcribe } = require('../gateway');
const scylla                    = require('../db/scylla');
const kafka                     = require('../kafka');

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildTranslations(text, senderLang, targetLangs) {
  const unique = [...new Set(targetLangs.filter(l => l !== senderLang))];
  const entries = await Promise.all(
    unique.map(async lang => [lang, await translate(text, senderLang, lang)]),
  );
  // Always keep the original language too (sender reads their own text)
  return Object.fromEntries([[senderLang, text], ...entries]);
}

async function broadcastMessage({ roomCode, msgId, sender, senderLang, original, translations, isAudio }) {
  await kafka.publish('message:incoming', {
    roomCode,
    message: {
      id:           msgId,
      sender,
      senderLang,
      original,
      translations,
      isAudio:      isAudio || false,
      timestamp:    Date.now(),
    },
  });
}

// ── Function 1: translate text message ────────────────────────────────────
// Inngest v4 API: trigger goes inside the first config object

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

    await step.run('save-to-scylladb', () =>
      scylla.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: false }),
    );

    await step.run('broadcast', () =>
      broadcastMessage({ roomCode, msgId, sender, senderLang, original: text, translations }),
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
      const result = await transcribe(audioBase64, mimeType, senderLang);
      if (!result?.trim()) throw new Error('Empty transcription');
      return result.trim();
    });

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs),
    );

    await step.run('save-to-scylladb', () =>
      scylla.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: true }),
    );

    await step.run('broadcast', () =>
      broadcastMessage({ roomCode, msgId, sender, senderLang, original: text, translations, isAudio: true }),
    );

    return { ok: true, msgId, text };
  },
);

module.exports = { translateMessage, transcribeAndTranslate };
