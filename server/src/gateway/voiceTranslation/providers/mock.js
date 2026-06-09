'use strict';

async function translateVoice(_audioBase64, _mimeType, sourceLang, targetLangs) {
  const text = 'Mock voice translation';
  const translations = Object.fromEntries([
    [sourceLang, text],
    ...targetLangs
      .filter(lang => lang !== sourceLang)
      .map(lang => [lang, `[${lang}] ${text}`]),
  ]);

  return { text, translations, audioOutputs: {} };
}

module.exports = { translateVoice };
