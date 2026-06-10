'use strict';

const gateway = require('../gateway/voiceTranslation');

async function translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options = {}) {
  return gateway.translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options);
}

module.exports = { translateVoice };

export {};
