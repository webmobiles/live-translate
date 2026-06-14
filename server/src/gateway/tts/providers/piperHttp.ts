// Piper local TTS — fast neural TTS covering languages Kokoro doesn't support.
// Voice models must be downloaded first: ./tdocker/install-piper-voices.sh
// Browse voices: https://rhasspy.github.io/piper-samples/

const PIPER_VOICE_BY_LANGUAGE: Record<string, string> = {
  ar: 'ar_JO-kareem-medium',
  cs: 'cs_CZ-jirka-medium',
  de: 'de_DE-thorsten-medium',
  fi: 'fi_FI-harri-medium',
  hu: 'hu_HU-anna-medium',
  nl: 'nl_NL-mls-medium',
  pl: 'pl_PL-mls-medium',
  ro: 'ro_RO-mihai-medium',
  ru: 'ru_RU-ruslan-medium',
  sv: 'sv_SE-nst-medium',
  tr: 'tr_TR-dfki-medium',
  uk: 'uk_UA-lada-x_low',
};

function getBaseUrl() {
  return (process.env.PIPER_BASE_URL || 'http://localhost:8881').replace(/\/+$/, '');
}

function normalizeLanguage(language: string) {
  return String(language || '').toLowerCase().split(/[-_]/)[0];
}

function getVoiceForLanguage(language: string, options: any = {}) {
  if (options.voice) return options.voice;
  const lang = normalizeLanguage(language);
  return process.env[`PIPER_VOICE_${lang.toUpperCase()}`] || PIPER_VOICE_BY_LANGUAGE[lang] || null;
}

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!text?.trim()) return null;

  const voice = getVoiceForLanguage(language, options);
  if (!voice) return null;

  const res = await fetch(`${getBaseUrl()}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, voice, model: 'piper' }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Piper HTTP ${res.status}: ${body}`);
  }

  const buffer = await res.arrayBuffer();
  return {
    audioBase64: Buffer.from(buffer).toString('base64'),
    mimeType: 'audio/wav',
  };
}
