'use strict';

/**
 * AI Façade
 *
 * Single point of access for all AI provider calls.
 * Business code never imports openai, azure, or google SDKs directly.
 * Switching providers or adding a new one only touches src/gateway/.
 */

const translation = require('./translation');
const stt = require('./stt');
const tts = require('./tts');
const voiceTranslation = require('./voiceTranslation');

/**
 * Translate text from one language to another.
 * Returns the translated string.
 */
async function translate(text, fromLang, toLang) {
  return translation.translate(text, fromLang, toLang);
}

/**
 * Transcribe base64-encoded audio to text.
 * Returns the transcribed string.
 */
async function transcribe(audioBase64, mimeType, language) {
  return stt.transcribe(audioBase64, mimeType, language);
}

module.exports = { translate, transcribe };
module.exports.synthesize = tts.synthesize;
module.exports.translateVoice = voiceTranslation.translateVoice;
