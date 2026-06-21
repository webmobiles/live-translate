// Translation providers come entirely from the TRANSLATION_PROVIDERS env var:
// a comma-separated list (e.g. "openai" or "openai,ollama"). The FIRST entry is
// the default/active provider; the whole list is what a room may select.
const TRANSLATION_PROVIDER_LIST = (process.env.TRANSLATION_PROVIDERS || '')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);
const TRANSLATION_PROVIDERS = new Set(TRANSLATION_PROVIDER_LIST);
const DEFAULT_TRANSLATION_PROVIDER = TRANSLATION_PROVIDER_LIST[0] || '';

export const DEFAULT_ROOM_CONFIG = {
  mode: 'normal' as 'normal' | 'solo_multilang',
  soloLanguages: null as [string, string] | null,
  guestDefaultLanguage: null as string | null,
  input: {
    text: true,
    voice: true,
  },
  voicePipeline: 'stt-text-translate',
  // Default = first entry of TRANSLATION_PROVIDERS. No hardcoded provider.
  translationProvider: DEFAULT_TRANSLATION_PROVIDER as string,
  output: {
    translatedText: true,
    translatedAudio: true,
  },
};

const VOICE_PIPELINES = new Set(['stt-text-translate', 'direct-voice-translation']);
const ROOM_MODES = new Set(['normal', 'solo_multilang']);

function bool(value: any, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSoloLanguages(langs: any): [string, string] | null {
  if (!Array.isArray(langs) || langs.length !== 2) return null;
  const [a, b] = langs.map(String);
  if (!a || !b || a === b) return null;
  return [a, b];
}

function normalizeRoomConfig(config: any = {}) {
  const mode = ROOM_MODES.has(config.mode) ? config.mode : DEFAULT_ROOM_CONFIG.mode;
  const soloLanguages = mode === 'solo_multilang'
    ? normalizeSoloLanguages(config.soloLanguages)
    : null;

  const guestDefaultLanguage =
    mode === 'normal' && typeof config.guestDefaultLanguage === 'string' && config.guestDefaultLanguage
      ? config.guestDefaultLanguage
      : null;

  const normalized = {
    mode,
    soloLanguages,
    guestDefaultLanguage,
    input: {
      text: bool(config.input?.text, DEFAULT_ROOM_CONFIG.input.text),
      voice: bool(config.input?.voice, DEFAULT_ROOM_CONFIG.input.voice),
    },
    voicePipeline: VOICE_PIPELINES.has(config.voicePipeline)
      ? config.voicePipeline
      : DEFAULT_ROOM_CONFIG.voicePipeline,
    translationProvider: TRANSLATION_PROVIDERS.has(config.translationProvider)
      ? (config.translationProvider as string)
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
