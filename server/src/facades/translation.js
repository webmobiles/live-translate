'use strict';

const gateway = require('../gateway/translation');

async function translate(text, fromLang, toLang) {
  return gateway.translate(text, fromLang, toLang);
}

module.exports = { translate };
