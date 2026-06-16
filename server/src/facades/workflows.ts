/**
 * Workflows Façade
 *
 * Single point of access for triggering background AI workflows.
 * Business code never imports inngest directly or knows event names.
 * If Inngest is replaced by Temporal, BullMQ, or another orchestrator,
 * only this file and src/inngest/ change.
 */

import { inngest } from '../inngest/client';
import { translateMessage, transcribeAndTranslate } from '../inngest/functions';
import { serve } from 'inngest/express';

/**
 * Trigger the text translation workflow.
 * Steps inside: translate → save to DB → broadcast to clients.
 */
export async function triggerTranslate({ msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig }: any) {
  return inngest.send({
    name: 'message/translate',
    data: { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig },
  });
}

/**
 * Trigger the voice transcription + translation workflow.
 * Steps inside: transcribe audio → translate → save to DB → broadcast.
 */
export async function triggerTranscribe({ msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig }: any) {
  return inngest.send({
    name: 'message/transcribe',
    data: { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, knownLanguages, roomConfig },
  });
}

/**
 * Returns the Express middleware that registers Inngest functions.
 * Mount this on POST /api/inngest in server.ts.
 */
export function httpHandler() {
  return serve({ client: inngest, functions: [translateMessage, transcribeAndTranslate] });
}
