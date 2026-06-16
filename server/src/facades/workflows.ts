/**
 * Workflows Façade
 *
 * Single point of access for triggering background AI workflows.
 * Business code never imports inngest directly or knows event names.
 * If Inngest is replaced by Temporal, BullMQ, or another orchestrator,
 * only this file and src/inngest/ change.
 */

import { inngest } from '../inngest/client';
import {
  runTranslateWorkflow,
  runTranscribeWorkflow,
  translateMessage,
  transcribeAndTranslate,
} from '../inngest/functions';
import { serve } from 'inngest/express';
import * as queue from './queue';
import { logger } from '../observability/logger';
import { severity } from '../observability/severity';

export function isInngestEnabled() {
  return process.env.INNGEST === 'on';
}

/**
 * Trigger the text translation workflow.
 * Steps inside: translate → save to DB → broadcast to clients.
 */
export async function triggerTranslate({ msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig }: any) {
  const data = { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig };
  if (!isInngestEnabled()) {
    void runTranslateWorkflow(data).catch(async err => {
      logger.error({ event: 'workflow.inline_translate_failed', severity: severity.P2, roomCode, roomId, msgId, err }, 'Inline translation workflow failed');
      await queue.publishSocketEvent('message:error', { roomCode, msgId });
    });
    return { ok: true, id: msgId, mode: 'inline' };
  }

  return inngest.send({
    name: 'message/translate',
    data,
  });
}

/**
 * Trigger the voice transcription + translation workflow.
 * Steps inside: transcribe audio → translate → save to DB → broadcast.
 */
export async function triggerTranscribe({ msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig }: any) {
  const data = { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig };
  if (!isInngestEnabled()) {
    void runTranscribeWorkflow(data).catch(async err => {
      logger.error({ event: 'workflow.inline_transcribe_failed', severity: severity.P2, roomCode, roomId, msgId, err }, 'Inline transcription workflow failed');
      await queue.publishSocketEvent('message:error', { roomCode, msgId });
    });
    return { ok: true, id: msgId, mode: 'inline' };
  }

  return inngest.send({
    name: 'message/transcribe',
    data,
  });
}

/**
 * Returns the Express middleware that registers Inngest functions.
 * Mount this on POST /api/inngest in server.ts.
 */
export function httpHandler() {
  return serve({ client: inngest, functions: [translateMessage, transcribeAndTranslate] });
}
