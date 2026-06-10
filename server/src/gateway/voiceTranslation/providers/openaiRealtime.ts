'use strict';

async function translateVoice() {
  throw new Error(
    'VOICE_TRANSLATION_PROVIDER=openai-realtime requires a streaming Realtime session, '
    + 'not the current batch Inngest audio workflow.',
  );
}

module.exports = { translateVoice };

export {};
