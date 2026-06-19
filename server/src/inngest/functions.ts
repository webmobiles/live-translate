import { inngest } from './client';
import * as db from '../facades/db';
import * as queue from '../facades/queue';
import * as translation from '../facades/translation';
import * as stt from '../facades/stt';
import * as tts from '../facades/tts';
import * as voiceTranslation from '../facades/voiceTranslation';
import { normalizeRoomConfig } from '../rooms/config';
import { persistMessageAudio } from '../audio/store';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';
import * as appMetrics from '../observability/metrics';
import { recordUsage, wordCount } from '../auth/usage';

const TRANSLATION_RETRIES = 2;
const TRANSLATION_RETRY_DELAY_MS = 500;
const TTS_TIMEOUT_MS = Number.parseInt(process.env.TTS_TIMEOUT_MS || '30000', 10);

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
        return [lang, await withTimeout(tts.synthesize(text, lang), TTS_TIMEOUT_MS, `TTS ${lang}`)];
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

function getTextTargetLangs(roomConfig: any, knownLanguages: any, participants: any[]) {
  if (roomConfig.mode === 'solo_multilang' && Array.isArray(roomConfig.soloLanguages)) {
    return roomConfig.soloLanguages.filter((lang: string) => lang);
  }
  return (knownLanguages?.length ? knownLanguages : participants.map((p: any) => p.language)) as string[];
}

function logAudioOutputsReady(context: Record<string, unknown>, audioOutputs: Record<string, unknown>) {
  const audioOutputLangs = Object.keys(audioOutputs || {});
  logger.info({
    event: 'message.audio_outputs.ready',
    ...context,
    audioOutputLangs,
    audioOutputCount: audioOutputLangs.length,
  }, 'Translated audio outputs ready');
}

type StepRunner = (label: string, fn: () => unknown | Promise<unknown>) => Promise<any>;

const inlineStep: StepRunner = async (_label, fn) => fn();

export async function runTranslateWorkflow(data: any, runStep: StepRunner = inlineStep) {
  const { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, senderUserId, participants, knownLanguages } = data;
  const roomConfig = normalizeRoomConfig(data.roomConfig);
  const targetLangs = getTextTargetLangs(roomConfig, knownLanguages, participants);
  const audioTargetLangs = getSoloTargetLangs(roomConfig, senderLang)
    ?? participants
      .filter((p: any) => p.socketId !== senderSocketId)
      .map((p: any) => p.language) as string[];

  await queue.publishMessageProgress(roomCode, msgId, 35, 'translating');

  const translations = await runStep('translate-text', async () => {
    const result = await buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider);
    await queue.publishMessageProgress(roomCode, msgId, 65, 'translated');
    return result;
  });

  await runStep('broadcast-translated-text', () =>
    queue.publishMessageTranslated(roomCode, {
      id: msgId,
      sender,
      senderLang,
      senderSocketId,
      original: text,
      translations,
      audioOutputs: {},
      isAudio: false,
      progress: 75,
      stage: 'generatingAudio',
      timestamp: Date.now(),
    }),
  );

  const audioOutputs = await runStep('generate-audio-output', async () => {
    await queue.publishMessageProgress(roomCode, msgId, 75, 'generatingAudio');
    const result = await buildAudioOutputs(translations, audioTargetLangs, roomConfig);
    logAudioOutputsReady({ roomCode, roomId, msgId, isAudio: false, audioTargetLangs }, result);
    await queue.publishMessageProgress(roomCode, msgId, 88, 'saving');
    return result;
  });

  await runStep('broadcast', () =>
    queue.publishMessageReady(roomCode, {
      id: msgId, sender, senderLang, senderSocketId, original: text, translations, audioOutputs, isAudio: false, timestamp: Date.now(),
    }),
  );

  await runStep('save-to-db', async () => {
    await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
    await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: false });
    if (senderUserId) {
      await recordUsage({ userId: senderUserId, usageKind: 'text_words', amount: wordCount(text), roomCode });
    }
  });

  return { ok: true, msgId };
}

export async function runTranscribeWorkflow(data: any, runStep: StepRunner = inlineStep) {
  const { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, senderUserId, audioSeconds, participants, knownLanguages } = data;
  const roomConfig = normalizeRoomConfig(data.roomConfig);
  const targetLangs = getTextTargetLangs(roomConfig, knownLanguages, participants);
  const audioTargetLangs = getSoloTargetLangs(roomConfig, senderLang)
    ?? participants
      // Receivers with the same language still need generated audio; only
      // exclude the sender socket in normal rooms.
      .filter((p: any) => p.socketId !== senderSocketId)
      .map((p: any) => p.language) as string[];

  if (roomConfig.voicePipeline === 'direct-voice-translation') {
    await queue.publishMessageProgress(roomCode, msgId, 35, 'directVoiceTranslation');

    const direct = await runStep('translate-voice-direct', async () => {
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

    const directAudioFiles = persistMessageAudio({ msgId, originalAudio: { audioBase64, mimeType }, audioOutputs });

    await runStep('broadcast', () =>
      queue.publishMessageReady(roomCode, {
        id: msgId,
        sender,
        senderLang,
        senderSocketId,
        original: text,
        translations,
        audioOutputs,
        // Original audio recovered on demand via GET …/audio/original, not pushed.
        isAudio: true,
        timestamp: Date.now(),
      }),
    );

    await runStep('save-to-db', async () => {
      await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
      await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true, ...directAudioFiles });
      if (senderUserId) {
        await recordUsage({ userId: senderUserId, usageKind: 'realtime_seconds', amount: Math.ceil(Number(audioSeconds) || 0), roomCode });
      }
    });

    return { ok: true, msgId, text };
  }

  await queue.publishMessageProgress(roomCode, msgId, 35, 'transcribing');

  const text = await runStep('transcribe-audio', async () => {
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

  const translations = await runStep('translate-text', async () => {
    await queue.publishMessageProgress(roomCode, msgId, 60, 'translating');
    const result = await buildTranslations(text, senderLang, targetLangs, roomConfig.translationProvider);
    await queue.publishMessageProgress(roomCode, msgId, 72, 'translated');
    return result;
  });

  await runStep('broadcast-translated-text', () =>
    queue.publishMessageTranslated(roomCode, {
      id: msgId,
      sender,
      senderLang,
      senderSocketId,
      original: text,
      translations,
      audioOutputs: {},
      // Original and translated audio are still being processed.
      isAudio: true,
      progress: 78,
      stage: 'generatingAudio',
      timestamp: Date.now(),
    }),
  );

  const audioOutputs = await runStep('generate-audio-output', async () => {
    await queue.publishMessageProgress(roomCode, msgId, 78, 'generatingAudio');
    const result = await buildAudioOutputs(translations, audioTargetLangs, roomConfig);
    logAudioOutputsReady({ roomCode, roomId, msgId, isAudio: true, audioTargetLangs }, result);
    await queue.publishMessageProgress(roomCode, msgId, 88, 'saving');
    return result;
  });

  await runStep('broadcast', () =>
    queue.publishMessageReady(roomCode, {
      id: msgId,
      sender,
      senderLang,
      senderSocketId,
      original: text,
      translations,
      audioOutputs,
      // Original audio recovered on demand via GET …/audio/original, not pushed.
      isAudio: true,
      timestamp: Date.now(),
    }),
  );

  const audioFiles = persistMessageAudio({ msgId, originalAudio: { audioBase64, mimeType }, audioOutputs });

  await runStep('save-to-db', async () => {
    await queue.publishMessageProgress(roomCode, msgId, 95, 'delivering');
    await db.saveMessage({ roomId, msgId, sender, senderLang, original: text, translations, audioOutputs, isAudio: true, ...audioFiles });
    if (senderUserId) {
      await recordUsage({ userId: senderUserId, usageKind: 'voice_seconds', amount: Math.ceil(Number(audioSeconds) || 0), roomCode });
    }
  });

  return { ok: true, msgId, text };
}

export const translateMessage = inngest.createFunction(
  {
    id: 'translate-message',
    retries: 3,
    triggers: [{ event: 'message/translate' }],
  },
  async ({ event, step }) => {
    return runTranslateWorkflow(event.data, (label, fn) => step.run(label, fn));
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
    return runTranscribeWorkflow(event.data, (label, fn) => step.run(label, fn));
  },
);
