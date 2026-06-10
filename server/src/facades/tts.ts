'use strict';

const gateway = require('../gateway/tts');

async function synthesize(text, language, options = {}) {
  return gateway.synthesize(text, language, options);
}

module.exports = { synthesize };

export {};
