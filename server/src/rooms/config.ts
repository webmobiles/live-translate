export const DEFAULT_ROOM_CONFIG = {
  input: {
    text: true,
    voice: true,
  },
  voicePipeline: 'stt-text-translate',
  translationProvider: 'ollama' as 'ollama' | 'openai',
  output: {
    translatedText: true,
    translatedAudio: true,
  },
};

const VOICE_PIPELINES = new Set(['stt-text-translate', 'direct-voice-translation']);
const TRANSLATION_PROVIDERS = new Set(['ollama', 'openai']);

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeRoomConfig(config: any = {}) {
  const normalized = {
    input: {
      text: bool(config.input?.text, DEFAULT_ROOM_CONFIG.input.text),
      voice: bool(config.input?.voice, DEFAULT_ROOM_CONFIG.input.voice),
    },
    voicePipeline: VOICE_PIPELINES.has(config.voicePipeline)
      ? config.voicePipeline
      : DEFAULT_ROOM_CONFIG.voicePipeline,
    translationProvider: TRANSLATION_PROVIDERS.has(config.translationProvider)
      ? (config.translationProvider as 'ollama' | 'openai')
      : DEFAULT_ROOM_CONFIG.translationProvider,
    output: {
      translatedText: bool(config.output?.translatedText, DEFAULT_ROOM_CONFIG.output.translatedText),
      translatedAudio: bool(config.output?.translatedAudio, DEFAULT_ROOM_CONFIG.output.translatedAudio),
    },
  };

  if (!normalized.input.text && !normalized.input.voice) normalized.input.text = true;
  if (!normalized.output.translatedText && !normalized.output.translatedAudio) normalized.output.translatedText = true;

  return normalized;
}

export { normalizeRoomConfig };
