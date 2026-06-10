'use strict';

const { inngest }  = require('./client');
const db           = require('../facades/db');
const queue        = require('../facades/queue');
const translation  = require('../facades/translation');
const stt          = require('../facades/stt');
const tts          = require('../facades/tts');
const voiceTranslation = require('../facades/voiceTranslation');
const { normalizeRoomConfig } = require('../rooms/config');

// ── Helpers ────────────────────────────────────────────────────────────────

const TRANSLATION_RETRIES = 2;
const TRANSLATION_RETRY_DELAY_MS = 500;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateWithFallback(text, senderLang, targetLang) {
  for (let attempt = 0; attempt <= TRANSLATION_RETRIES; attempt += 1) {
    try {
      return await translation.translate(text, senderLang, targetLang);
    } catch (err) {
      const isLastAttempt = attempt === TRANSLATION_RETRIES;
      console.warn(
        `[translate] ${senderLang}->${targetLang} failed`
        + ` (${attempt + 1}/${TRANSLATION_RETRIES + 1}): ${err.message}`,
      );
      if (isLastAttempt) return `${text} (not translated)`;
      await wait(TRANSLATION_RETRY_DELAY_MS);
    }
  }

  return `${text} (not translated)`;
}

async function buildTranslations(text, senderLang, targetLangs) {
  const unique = [...new Set(targetLangs.filter(l => l !== senderLang))];
  const entries = await Promise.all(
    unique.map(async lang => [lang, await translateWithFallback(text, senderLang, lang)]),
  );
  return Object.fromEntries([[senderLang, text], ...entries]);
}

async function buildAudioOutputs(translations: any, targetLangs: any[], roomConfig) {
  if (!roomConfig.output.translatedAudio) return {};

  const unique = [...new Set(targetLangs)];
  const entries = await Promise.all(
    unique.map(async lang => {
      const text = translations[lang];
      if (!text) return [lang, null];
      try {
        return [lang, await tts.synthesize(text, lang)];
      } catch (err) {
        console.warn(`[tts] ${lang} failed: ${err.message}`);
        return [lang, null];
      }
    }),
  );

  return Object.fromEntries(entries.filter(([, audio]) => audio));
}

// ── Function 1: translate text message ────────────────────────────────────

const translateMessage = inngest.createFunction(
  {
    id: 'translate-message',
    retries: 3,
    triggers: [{ event: 'message/translate' }],
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants } = event.data;
    const roomConfig = normalizeRoomConfig(event.data.roomConfig);
    const targetLangs = participants.map(p => p.language);

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs),
    );

    const audioOutputs = await step.run('generate-audio-output', () =>
      buildAudioOutputs(translations, targetLangs, roomConfig),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: false }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId, sender, senderLang, senderSocketId, original: text, translations, audioOutputs, isAudio: false, timestamp: Date.now(),
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
    const { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants } = event.data;
    const roomConfig = normalizeRoomConfig(event.data.roomConfig);
    const targetLangs = participants.map(p => p.language);

    if (roomConfig.voicePipeline === 'direct-voice-translation') {
      const direct = await step.run('translate-voice-direct', () =>
        voiceTranslation.translateVoice(audioBase64, mimeType, senderLang, targetLangs, roomConfig),
      );

      const text = direct.text?.trim() || '[voice message]';
      const translations = direct.translations || Object.fromEntries([[senderLang, text]]);
      const audioOutputs = direct.audioOutputs || {};

      await step.run('save-to-db', () =>
        db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: true }),
      );

      await step.run('broadcast', () =>
        queue.publishMessageReady(roomCode, {
          id: msgId, sender, senderLang, senderSocketId, original: text, translations, audioOutputs, isAudio: true, timestamp: Date.now(),
        }),
      );

      return { ok: true, msgId, text };
    }

    const text = await step.run('transcribe-audio', async () => {
      const result = await stt.transcribe(audioBase64, mimeType, senderLang);
      if (!result?.trim()) throw new Error('Empty transcription');
      return result.trim();
    });

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs),
    );

    const audioOutputs = await step.run('generate-audio-output', () =>
      buildAudioOutputs(translations, targetLangs, roomConfig),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, isAudio: true }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId, sender, senderLang, senderSocketId, original: text, translations, audioOutputs, isAudio: true, timestamp: Date.now(),
      }),
    );

    return { ok: true, msgId, text };
  },
);

module.exports = { translateMessage, transcribeAndTranslate };

export {};
