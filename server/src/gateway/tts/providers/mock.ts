'use strict';

async function synthesize(text) {
  return {
    audioBase64: Buffer.from(`Mock TTS: ${text}`).toString('base64'),
    mimeType: 'text/plain',
  };
}

module.exports = { synthesize };

export {};
