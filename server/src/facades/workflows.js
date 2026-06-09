'use strict';

/**
 * Workflows Façade
 *
 * Single point of access for triggering background AI workflows.
 * Business code never imports inngest directly or knows event names.
 * If Inngest is replaced by Temporal, BullMQ, or another orchestrator,
 * only this file and src/inngest/ change.
 */

const { inngest }                            = require('../inngest/client');
const { translateMessage, transcribeAndTranslate } = require('../inngest/functions');
const { serve }                              = require('inngest/express');

/**
 * Trigger the text translation workflow.
 * Steps inside: translate → save to DB → broadcast to clients.
 */
async function triggerTranslate({ msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, roomConfig }) {
  return inngest.send({
    name: 'message/translate',
    data: { msgId, roomCode, roomId, text, senderLang, sender, senderSocketId, participants, roomConfig },
  });
}

/**
 * Trigger the voice transcription + translation workflow.
 * Steps inside: transcribe audio → translate → save to DB → broadcast.
 */
async function triggerTranscribe({ msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, roomConfig }) {
  return inngest.send({
    name: 'message/transcribe',
    data: { msgId, roomCode, roomId, audioBase64, mimeType, senderLang, sender, senderSocketId, participants, roomConfig },
  });
}

/**
 * Returns the Express middleware that registers Inngest functions.
 * Mount this on POST /api/inngest in server.js.
 */
function httpHandler() {
  return serve({ client: inngest, functions: [translateMessage, transcribeAndTranslate] });
}

module.exports = { triggerTranslate, triggerTranscribe, httpHandler };
