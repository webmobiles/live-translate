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

async function buildAudioOutputs(translations: any, targetLangs: any[], roomConfig: any) {
  if (!roomConfig.output.translatedAudio) return {};

  const unique = [...new Set(targetLangs)];
  const entries = await Promise.all(
    unique.map(async lang => {
      const text = translations[lang];
      if (!text) return [lang, null];
      try {
        appMetrics.recordTtsInput({ language: lang, text });
        // `lang` is the receiver's target language. TTS providers must use it
        // for pronunciation/voice selection; do not replace it with senderLang
        // or a static env language.
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

function getSoloTargetLangs(roomConfig: any, senderLang: string) {
  if (roomConfig.mode !== 'solo_multilang' || !Array.isArray(roomConfig.soloLanguages)) return null;
  return roomConfig.soloLanguages.filter((lang: string) => lang && lang !== senderLang);
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
    const audioTargetLangs = getSoloTargetLangs(roomConfig, senderLang)
      ?? participants
        .filter((p: any) => p.socketId !== senderSocketId)
        .map((p: any) => p.language) as string[];

    await queue.publishMessageProgress(roomCode, msgId, 35, 'translating');

    const translations = await step.run('translate-text', async () => {
      const result = await buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider);
      await queue.publishMessageProgress(roomCode, msgId, 65, 'translated');
      return result;
    });

    const audioOutputs = await step.run('generate-audio-output', async () => {
      await queue.publishMessageProgress(roomCode, msgId, 75, 'generatingAudio');
      const result = await buildAudioOutputs(translations, audioTargetLangs, roomConfig);
      await queue.publishMessageProgress(roomCode, msgId, 88, 'saving');
      return result;
    });

    await step.run('save-to-db', async () => {
      await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: false });
      await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
    });

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
    onFailure: async ({ event: fnEvent, error: fnError }) => {
      const { roomCode, msgId } = fnEvent?.data as any ?? {};
      if (!roomCode || !msgId) return;
      await queue.publishSocketEvent('message:error', { roomCode, msgId });
    },
  },
  async ({ event, step }) => {
    const { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages } = event.data;
    const roomConfig = normalizeRoomConfig(event.data.roomConfig);
    const targetLangs = (knownLanguages?.length ? knownLanguages : participants.map((p: any) => p.language)) as string[];
    const audioTargetLangs = getSoloTargetLangs(roomConfig, senderLang)
      ?? participants
        .filter((p: any) => p.socketId !== senderSocketId && p.language !== senderLang)
        .map((p: any) => p.language) as string[];

    if (roomConfig.voicePipeline === 'direct-voice-translation') {
      await queue.publishMessageProgress(roomCode, msgId, 35, 'directVoiceTranslation');

      const direct = await step.run('translate-voice-direct', async () => {
        const result = await voiceTranslation.translateVoice(audioBase64, mimeType, senderLang, targetLangs, roomConfig);
        await queue.publishMessageProgress(roomCode, msgId, 75, 'generatingAudio');
        return result;
      });

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

      await queue.publishMessageProgress(roomCode, msgId, 88, 'saving');

      await step.run('save-to-db', async () => {
        await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true });
        await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
      });

      await queue.publishMessageProgress(roomCode, msgId, 100, 'delivered');

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

    await queue.publishMessageProgress(roomCode, msgId, 35, 'transcribing');

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
    await queue.publishMessageProgress(roomCode, msgId, 50, 'transcribed');

    const translations = await step.run('translate-text', async () => {
      await queue.publishMessageProgress(roomCode, msgId, 60, 'translating');
      const result = await buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider);
      await queue.publishMessageProgress(roomCode, msgId, 72, 'translated');
      return result;
    });

    const audioOutputs = await step.run('generate-audio-output', async () => {
      await queue.publishMessageProgress(roomCode, msgId, 78, 'generatingAudio');
      const result = await buildAudioOutputs(translations, audioTargetLangs, roomConfig);
      await queue.publishMessageProgress(roomCode, msgId, 88, 'saving');
      return result;
    });

    await step.run('save-to-db', async () => {
      await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true });
      await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
    });

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
