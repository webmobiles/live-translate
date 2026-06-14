import { inngest } from './client';
import * as db from '../facades/db';
import * as queue from '../facades/queue';
import * as translation from '../facades/translation';
import * as stt from '../facades/stt';
import * as tts from '../facades/tts';
import * as voiceTranslation from '../facades/voiceTranslation';
import { normalizeRoomConfig } from '../rooms/config';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';
import * as appMetrics from '../observability/metrics';

const TRANSLATION_RETRIES = 2;
const TRANSLATION_RETRY_DELAY_MS = 500;

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateWithFallback(text: string, senderLang: string, targetLang: string, provider?: string) {
  const start = Date.now();
  for (let attempt = 0; attempt <= TRANSLATION_RETRIES; attempt += 1) {
    try {
      const result = await translation.translate(text, senderLang, targetLang, provider);
      logger.info({
        event: 'translation.ok',
        provider,
        senderLang,
        targetLang,
        durationMs: Date.now() - start,
        attempt: attempt + 1,
      }, 'Translation completed');
      return result;
    } catch (err) {
      const isLastAttempt = attempt === TRANSLATION_RETRIES;
      logger.warn({
        event: 'translation.retry_failed',
        severity: severity.P3,
        provider,
        senderLang,
        targetLang,
        attempt: attempt + 1,
        maxAttempts: TRANSLATION_RETRIES + 1,
        err,
      }, 'Translation attempt failed');
      if (isLastAttempt) {
        logger.error({
          event: 'translation.failed',
          severity: severity.P2,
          provider,
          senderLang,
          targetLang,
          durationMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : String(err),
          err,
        }, 'Translation failed after all retries');
        return `${text} (not translated)`;
      }
      await wait(TRANSLATION_RETRY_DELAY_MS);
    }
  }

  return `${text} (not translated)`;
}

async function buildTranslations(text: string, senderLang: string, targetLangs: string[], provider?: string) {
  const unique = [...new Set(targetLangs.filter(l => l !== senderLang))];
  const entries = await Promise.all(
    unique.map(async lang => [lang, await translateWithFallback(text, senderLang, lang, provider)]),
  );
  return Object.fromEntries([[senderLang, text], ...entries]);
}

async function buildAudioOutputs(translations: any, targetLangs: any[], roomConfig: any, senderLang?: string) {
  if (!roomConfig.output.translatedAudio) return {};

  // Never synthesize audio in the sender's own language — they already know what they said
  const unique = [...new Set(targetLangs)].filter(lang => lang !== senderLang);
  const entries = await Promise.all(
    unique.map(async lang => {
      const text = translations[lang];
      if (!text) return [lang, null];
      try {
        appMetrics.recordTtsInput({ language: lang, text });
        return [lang, await tts.synthesize(text, lang)];
      } catch (err: any) {
        const isConfigError = /unknown tts_provider/i.test(err?.message || '');
        logger[isConfigError ? 'error' : 'warn']({
          event: 'tts.failed',
          severity: isConfigError ? severity.P2 : severity.P3,
          language: lang,
          err,
        }, isConfigError ? 'TTS misconfigured — check TTS_PROVIDER in .env' : 'TTS synthesis failed');
        return [lang, null];
      }
    }),
  );

  return Object.fromEntries(entries.filter(([, audio]) => audio));
}

export const translateMessage = inngest.createFunction(
  {
    id: 'translate-message',
    retries: 3,
    triggers: [{ event: 'message/translate' }],
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, knownLanguages } = event.data;
    const roomConfig = normalizeRoomConfig(event.data.roomConfig);
    const targetLangs = (knownLanguages?.length ? knownLanguages : participants.map((p: any) => p.language)) as string[];

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider),
    );

    const audioOutputs = await step.run('generate-audio-output', () =>
      buildAudioOutputs(translations, targetLangs, roomConfig, senderLang),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: false }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId, sender, senderLang, senderSocketId, original: text, translations, audioOutputs, isAudio: false, timestamp: Date.now(),
      }),
    );

    return { ok: true, msgId };
  },
);

export const transcribeAndTranslate = inngest.createFunction(
  {
    id: 'transcribe-and-translate',
    retries: 3,
    triggers: [{ event: 'message/transcribe' }],
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages } = event.data;
    const roomConfig = normalizeRoomConfig(event.data.roomConfig);
    const targetLangs = (knownLanguages?.length ? knownLanguages : participants.map((p: any) => p.language)) as string[];

    if (roomConfig.voicePipeline === 'direct-voice-translation') {
      const direct = await step.run('translate-voice-direct', () =>
        voiceTranslation.translateVoice(audioBase64, mimeType, senderLang, targetLangs, roomConfig),
      );

      const text = direct.text?.trim() || '[voice message]';
      const translations = direct.translations || Object.fromEntries([[senderLang, text]]);
      const audioOutputs = direct.audioOutputs || {};
      appMetrics.recordWords({
        type: 'audio',
        stage: 'transcribed',
        roomCode,
        roomId,
        language: senderLang,
        text,
      });

      await step.run('save-to-db', () =>
        db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true }),
      );

      await step.run('broadcast', () =>
        queue.publishMessageReady(roomCode, {
          id: msgId,
          sender,
          senderLang,
          senderSocketId,
          original: text,
          translations,
          audioOutputs,
          originalAudio: { audioBase64, mimeType },
          isAudio: true,
          timestamp: Date.now(),
        }),
      );

      return { ok: true, msgId, text };
    }

    const text = await step.run('transcribe-audio', async () => {
      const result = await stt.transcribe(audioBase64, mimeType, senderLang);
      if (!result?.trim()) throw new Error('Empty transcription');
      return result.trim();
    });
    appMetrics.recordWords({
      type: 'audio',
      stage: 'transcribed',
      roomCode,
      roomId,
      language: senderLang,
      text,
    });

    const translations = await step.run('translate-text', () =>
      buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider),
    );

    const audioOutputs = await step.run('generate-audio-output', () =>
      buildAudioOutputs(translations, targetLangs, roomConfig, senderLang),
    );

    await step.run('save-to-db', () =>
      db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true }),
    );

    await step.run('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId,
        sender,
        senderLang,
        senderSocketId,
        original: text,
        translations,
        audioOutputs,
        originalAudio: { audioBase64, mimeType },
        isAudio: true,
        timestamp: Date.now(),
      }),
    );

    return { ok: true, msgId, text };
  },
);
