'use strict';

const translation = require('./translation');
const stt = require('./stt');
const tts = require('./tts');
const voiceTranslation = require('./voiceTranslation');

module.exports = {
  translate: translation.translate,
  transcribe: stt.transcribe,
  synthesize: tts.synthesize,
  translateVoice: voiceTranslation.translateVoice,
};
