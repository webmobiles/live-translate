import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('live-translate-server');

const messageCounter = meter.createCounter('live_translate_messages', {
  description: 'Number of chat messages received by the server.',
  unit: '{message}',
});

const wordCounter = meter.createCounter('live_translate_words', {
  description: 'Number of words received or produced by live translate workflows.',
  unit: '{word}',
});

const audioInputSecondsCounter = meter.createCounter('live_translate_audio_input_seconds', {
  description: 'Audio input duration received by the server.',
  unit: 's',
});

const ttsRequestCounter = meter.createCounter('live_translate_tts_requests', {
  description: 'Number of text-to-speech synthesis requests.',
  unit: '{request}',
});

export function countWords(text: string) {
  if (typeof text !== 'string') return 0;
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function finitePositiveNumber(value: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function estimateAudioSecondsFromBytes(byteCount: number) {
  const bitrateBps = finitePositiveNumber(process.env.AUDIO_ESTIMATED_BITRATE_BPS) || 128000;
  const bytes = finitePositiveNumber(byteCount);
  if (!bytes) return 0;
  return (bytes * 8) / bitrateBps;
}

export function getAudioDurationSeconds(payload: any = {}) {
  const exactSeconds = finitePositiveNumber(payload.durationSeconds ?? payload.audioDurationSeconds);
  if (exactSeconds) return { seconds: exactSeconds, source: 'client' };

  const exactMs = finitePositiveNumber(payload.durationMs ?? payload.audioDurationMs);
  if (exactMs) return { seconds: exactMs / 1000, source: 'client' };

  const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64 : '';
  const estimatedBytes = Math.round(audioBase64.length * 0.75);
  const estimatedSeconds = estimateAudioSecondsFromBytes(estimatedBytes);
  return { seconds: estimatedSeconds, source: estimatedSeconds ? 'estimated_bitrate' : 'unknown' };
}

export function recordMessage({ type, roomCode, roomId, language, text }: any) {
  const attributes = {
    type,
    room_code: roomCode || 'unknown',
    room_id: roomId || 'unknown',
    language: language || 'unknown',
  };

  messageCounter.add(1, attributes);

  const words = countWords(text);
  if (words > 0) {
    wordCounter.add(words, { ...attributes, stage: 'received' });
  }
}

export function recordWords({ type, stage, roomCode, roomId, language, text }: any) {
  const words = countWords(text);
  if (words <= 0) return;

  wordCounter.add(words, {
    type: type || 'unknown',
    stage: stage || 'unknown',
    room_code: roomCode || 'unknown',
    room_id: roomId || 'unknown',
    language: language || 'unknown',
  });
}

export function recordAudioInput({ roomCode, roomId, language, seconds, source }: any) {
  if (!seconds || seconds <= 0) return;
  audioInputSecondsCounter.add(seconds, {
    room_code: roomCode || 'unknown',
    room_id: roomId || 'unknown',
    language: language || 'unknown',
    duration_source: source || 'unknown',
  });
}

export function recordTtsInput({ language, text }: any) {
  const attributes = { language: language || 'unknown' };
  ttsRequestCounter.add(1, attributes);

  const words = countWords(text);
  if (words > 0) {
    wordCounter.add(words, { ...attributes, type: 'tts', stage: 'tts_input' });
  }
}
