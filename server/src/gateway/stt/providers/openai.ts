'use strict';

const openai = require('../../providers/openai');

async function transcribe(audioBase64, mimeType, language) {
  return openai.transcribe(audioBase64, mimeType, language);
}

module.exports = { transcribe };

export {};
