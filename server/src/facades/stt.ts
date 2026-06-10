'use strict';

const gateway = require('../gateway/stt');

async function transcribe(audioBase64, mimeType, language) {
  return gateway.transcribe(audioBase64, mimeType, language);
}

module.exports = { transcribe };

export {};
