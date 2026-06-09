'use strict';

async function translateVoice() {
  throw new Error('Direct voice translation is disabled. Set VOICE_TRANSLATION_PROVIDER or use stt-text-translate.');
}

module.exports = { translateVoice };
