import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../models/language.dart';
import '../models/message.dart';
import '../models/message_view.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// Port of mobile/src/components/MessageBubble.tsx (formatMessageTime + bubble).
String formatMessageTime(int timestamp) {
  final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
  final elapsedMs = DateTime.now().millisecondsSinceEpoch - timestamp;
  if (elapsedMs < 0) {
    return TimeOfDay.fromDateTime(date).format24();
  }
  final minutes = elapsedMs ~/ 60000;
  if (minutes < 1) return 'now';
  if (minutes < 60) return '$minutes min ago';
  final hours = elapsedMs ~/ 3600000;
  if (hours < 24) return '${hours}h ago';
  final days = elapsedMs ~/ 86400000;
  if (days < 7) return days == 1 ? '1 day ago' : '$days days ago';
  return '${date.day}/${date.month}/${date.year}';
}

extension on TimeOfDay {
  String format24() =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

class MessageBubble extends StatelessWidget {
  final String? code;
  final Message message;
  final bool isSolo;
  final List<String>? soloLanguages;
  final bool autoplay;
  final bool playTranslatedAudio;
  final VoidCallback? onRetry;
  const MessageBubble({
    super.key,
    this.code,
    required this.message,
    this.isSolo = false,
    this.soloLanguages,
    this.autoplay = false,
    this.playTranslatedAudio = true,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final isMine = message.isMine;
    final senderInfo = getLang(message.senderLang);
    final time = formatMessageTime(message.timestamp);
    final isInFlight = message.isTranslating ||
        message.deliveryStatus == 'sending' ||
        message.deliveryStatus == 'queued' ||
        ((message.progress ?? 0) > 0 && (message.progress ?? 0) < 100);
    final stageLabel = isInFlight ? _progressLabel(context, message) : null;

    if (isSolo && !message.isTranslating) {
      return _SoloMessageBubble(
        code: code,
        message: message,
        soloLanguages: soloLanguages,
        stageLabel: stageLabel,
        time: time,
        autoplay: autoplay,
        playTranslatedAudio: playTranslatedAudio,
        onRetry: onRetry,
      );
    }

    if (message.isTranslating) {
      // In-flight bubble: shows the text (or "…") plus a crawling progress bar
      // while the server transcribes/translates. Mirrors the web progress bar.
      final placeholder = message.original.isNotEmpty ? message.original : '…';
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment:
              isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isMine)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(senderInfo.flag, style: TextStyle(fontSize: 16)),
                    const SizedBox(width: 6),
                    Text(message.sender,
                        style: TextStyle(
                            color: AppColors.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ConstrainedBox(
              constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.78),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: isMine ? AppColors.primary : AppColors.card,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isMine ? 16 : 4),
                    bottomRight: Radius.circular(isMine ? 4 : 16),
                  ),
                  border: isMine ? null : Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.isAudio)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('🎤 Voice',
                            style: TextStyle(
                                fontSize: 12,
                                color:
                                    isMine ? Colors.white70 : AppColors.muted)),
                      ),
                    if (message.isAudio)
                      _FakeWaveform(isMine: isMine, seed: message.id)
                    else
                      Text(placeholder,
                          style: TextStyle(
                              color: isMine ? Colors.white : AppColors.text,
                              fontSize: 16,
                              height: 1.4)),
                  ],
                ),
              ),
            ),
            TranslationProgressBar(
              align: isMine ? Alignment.centerRight : Alignment.centerLeft,
              progress: message.progress,
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(stageLabel ?? time,
                      style: TextStyle(color: AppColors.muted, fontSize: 12)),
                  if (isMine) ...[
                    const SizedBox(width: 4),
                    _DeliveryIcon(status: message.deliveryStatus),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
    }

    final showOriginal = !isMine && message.translated != message.original;
    // Normal room: emitter = the sender; receiver = me (in my changeable language).
    final view = MessageView.of(message, isSolo: false);
    final playableOriginalAudio = view.canRecoverOriginal
        ? _audioPayloadFromMap(message.originalAudio)
        : null;
    final playableTranslatedAudio = playTranslatedAudio
        ? _audioPayloadFromMap(message.translatedAudio)
        : null;
    final audioToPlay = playableTranslatedAudio ?? playableOriginalAudio;
    final fallbackAudio =
        playableTranslatedAudio != null ? playableOriginalAudio : null;
    // Original audio is recovered on demand (not pushed inline), offered to the
    // emitter side. See MessageView / README "Emitter and receiver roles".
    final showOriginalRecover = message.isAudio &&
        message.hasOriginalAudio &&
        view.canRecoverOriginal &&
        playableOriginalAudio == null &&
        code != null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment:
            isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!isMine)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(senderInfo.flag, style: TextStyle(fontSize: 16)),
                  const SizedBox(width: 6),
                  Text(
                    message.sender,
                    style: TextStyle(
                      color: AppColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isMine ? AppColors.primary : AppColors.card,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMine ? 16 : 4),
                  bottomRight: Radius.circular(isMine ? 4 : 16),
                ),
                border: message.failed
                    ? Border.all(color: AppColors.danger)
                    : (isMine ? null : Border.all(color: AppColors.border)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.isAudio)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        '🎤 Voice',
                        style: TextStyle(
                          fontSize: 12,
                          color: isMine ? Colors.white70 : AppColors.muted,
                        ),
                      ),
                    ),
                  if (message.isAudio || audioToPlay != null) ...[
                    if (audioToPlay != null)
                      _AudioWaveformPlayer(
                        primary: audioToPlay,
                        fallback: fallbackAudio,
                        isMine: isMine,
                        seed: message.id,
                        autoplay: autoplay,
                      )
                    else if (!showOriginalRecover)
                      _FakeWaveform(isMine: isMine, seed: message.id),
                    if (showOriginalRecover)
                      Padding(
                        padding:
                            EdgeInsets.only(top: audioToPlay != null ? 8 : 0),
                        child: _OriginalAudioRecover(
                            code: code!, msgId: message.id, isMine: isMine),
                      ),
                    const SizedBox(height: 8),
                  ],
                  Text(
                    message.translated,
                    style: TextStyle(
                      color: isMine ? Colors.white : AppColors.text,
                      fontSize: 16,
                      height: 1.4,
                    ),
                  ),
                  if (showOriginal)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        message.original,
                        style: TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (isInFlight)
            TranslationProgressBar(
              align: isMine ? Alignment.centerRight : Alignment.centerLeft,
              progress: message.progress,
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  stageLabel ?? time,
                  style: TextStyle(color: AppColors.muted, fontSize: 12),
                ),
                if (isMine) ...[
                  const SizedBox(width: 4),
                  _DeliveryIcon(status: message.deliveryStatus),
                ],
              ],
            ),
          ),
          if (message.failed)
            GestureDetector(
              onTap: onRetry,
              child: Padding(
                padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
                child: Text(
                  '⚠ Couldn\'t translate — tap to retry',
                  style: TextStyle(
                    color: AppColors.danger,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

String _progressLabel(BuildContext context, Message message) {
  final stage = message.progressStage ?? _stageFromProgress(message.progress);
  return context.appState.t('room.progress.$stage',
      fallback: context.appState
          .t('room.progress.sending', fallback: 'Sending to server'));
}

String _stageFromProgress(double? progress) {
  if (progress == null || progress < 25) return 'sending';
  if (progress < 35) return 'received';
  if (progress < 55) return 'transcribing';
  if (progress < 75) return 'translating';
  if (progress < 90) return 'generatingAudio';
  if (progress < 96) return 'delivering';
  return 'delivered';
}

class _DeliveryIcon extends StatelessWidget {
  final String? status;
  const _DeliveryIcon({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = status == 'read'
        ? AppColors.accent
        : status == 'failed'
            ? AppColors.danger
            : AppColors.muted;
    final text = switch (status) {
      'sending' => '◷',
      'queued' => '✓',
      'delivered' => '✓✓',
      'read' => '✓✓',
      'failed' => '!',
      _ => '',
    };
    if (text.isEmpty) return const SizedBox.shrink();
    return Text(text,
        style:
            TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700));
  }
}

class _AudioPayload {
  final String audioBase64;
  final String mimeType;
  const _AudioPayload({required this.audioBase64, required this.mimeType});

  Uint8List? get bytes {
    try {
      return base64Decode(audioBase64);
    } catch (_) {
      return null;
    }
  }
}

_AudioPayload? _audioPayloadFromMap(Map<String, dynamic>? audio) {
  final audioBase64 = audio?['audioBase64'];
  final mimeType = audio?['mimeType'];
  if (audioBase64 is! String ||
      audioBase64.isEmpty ||
      mimeType is! String ||
      mimeType.isEmpty) {
    return null;
  }
  return _AudioPayload(audioBase64: audioBase64, mimeType: mimeType);
}

/// Recovers a voice message's original audio on demand (it is no longer pushed
/// inline). Shows a download button; on tap it GETs the file once, then renders
/// the normal waveform player and autoplays it.
class _OriginalAudioRecover extends StatefulWidget {
  final String code;
  final String msgId;
  final bool isMine;
  const _OriginalAudioRecover({
    required this.code,
    required this.msgId,
    required this.isMine,
  });

  @override
  State<_OriginalAudioRecover> createState() => _OriginalAudioRecoverState();
}

class _OriginalAudioRecoverState extends State<_OriginalAudioRecover> {
  _AudioPayload? _recovered;
  bool _loading = false;
  bool _error = false;

  Future<void> _recover() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    final uri = Uri.parse('$kServerUrl/api/rooms/'
        '${Uri.encodeComponent(widget.code)}/messages/'
        '${Uri.encodeComponent(widget.msgId)}/audio/original');
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 12);
    try {
      final req = await client.getUrl(uri);
      final res = await req.close().timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw Exception('status ${res.statusCode}');
      final bytes = <int>[];
      await for (final chunk in res) {
        bytes.addAll(chunk);
      }
      final mime = res.headers.contentType?.mimeType ?? 'audio/mpeg';
      if (!mounted) return;
      setState(() {
        _recovered =
            _AudioPayload(audioBase64: base64Encode(bytes), mimeType: mime);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    } finally {
      client.close();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_recovered != null) {
      return _AudioWaveformPlayer(
        primary: _recovered!,
        fallback: null,
        isMine: widget.isMine,
        seed: '${widget.msgId}:original',
        autoplay: true,
      );
    }
    final color = widget.isMine ? Colors.white70 : AppColors.muted;
    return GestureDetector(
      onTap: _loading ? null : _recover,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: widget.isMine
              ? AppColors.text.withValues(alpha: 0.12)
              : AppColors.bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _loading
                  ? Icons.hourglass_top
                  : (_error ? Icons.refresh : Icons.download_rounded),
              size: 16,
              color: color,
            ),
            const SizedBox(width: 6),
            Text(
              _loading ? 'Loading…' : (_error ? 'Retry' : 'Original audio'),
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

class _AudioWaveformPlayer extends StatefulWidget {
  final _AudioPayload primary;
  final _AudioPayload? fallback;
  final bool isMine;
  final String seed;
  final bool autoplay;

  const _AudioWaveformPlayer({
    required this.primary,
    required this.fallback,
    required this.isMine,
    required this.seed,
    required this.autoplay,
  });

  @override
  State<_AudioWaveformPlayer> createState() => _AudioWaveformPlayerState();
}

class _AudioWaveformPlayerState extends State<_AudioWaveformPlayer> {
  late final AudioPlayer _player;
  bool _isPlaying = false;
  bool _usingFallback = false;
  String _lastAutoplayKey = '';

  @override
  void initState() {
    super.initState();
    _player = AudioPlayer();
    _player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => _isPlaying = state == PlayerState.playing);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoplay());
  }

  @override
  void didUpdateWidget(covariant _AudioWaveformPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoplay());
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  String get _sourceKey {
    final payload =
        _usingFallback ? widget.fallback ?? widget.primary : widget.primary;
    return '${widget.seed}:${payload.mimeType}:${payload.audioBase64.length}:$_usingFallback';
  }

  void _maybeAutoplay() {
    if (!mounted || !widget.autoplay || _lastAutoplayKey == _sourceKey) return;
    _lastAutoplayKey = _sourceKey;
    _play();
  }

  Future<void> _toggle() async {
    if (_isPlaying) {
      await _player.pause();
      return;
    }
    await _play();
  }

  Future<void> _play() async {
    final payload =
        _usingFallback ? widget.fallback ?? widget.primary : widget.primary;
    final bytes = payload.bytes;
    if (bytes == null || bytes.isEmpty) {
      await _tryFallback();
      return;
    }
    try {
      await _player.stop();
      await _player.play(BytesSource(bytes, mimeType: payload.mimeType));
    } catch (_) {
      await _tryFallback();
    }
  }

  Future<void> _tryFallback() async {
    if (_usingFallback || widget.fallback == null) return;
    setState(() => _usingFallback = true);
    await _play();
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.isMine ? Colors.white70 : AppColors.primary;
    final inactive = widget.isMine ? Colors.white24 : AppColors.primaryMuted;
    final bars = _waveBars(widget.seed);

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        InkWell(
          onTap: _toggle,
          customBorder: const CircleBorder(),
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: widget.isMine ? Colors.white12 : AppColors.primaryMuted,
              shape: BoxShape.circle,
            ),
            child: Icon(
              _isPlaying ? Icons.pause : Icons.play_arrow,
              color: widget.isMine ? Colors.white : AppColors.primary,
              size: 18,
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 150,
          height: 30,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              for (var i = 0; i < bars.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Container(
                    width: 3,
                    height: bars[i],
                    decoration: BoxDecoration(
                      color: _isPlaying && i < 10 ? active : inactive,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

List<double> _waveBars(String seed) => List<double>.generate(28, (i) {
      final code = seed.isEmpty ? 17 : seed.codeUnitAt(i % seed.length);
      final envelope = 0.35 + (i % 9) / 12;
      final noise = ((code + i * 31) % 10) / 12;
      return 6 + (envelope + noise) * 16;
    });

class _FakeWaveform extends StatelessWidget {
  final bool isMine;
  final String seed;
  const _FakeWaveform({required this.isMine, required this.seed});

  @override
  Widget build(BuildContext context) {
    final active = isMine ? Colors.white70 : AppColors.primary;
    final inactive = isMine ? Colors.white24 : AppColors.primaryMuted;
    final bars = _waveBars(seed);

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isMine ? Colors.white12 : AppColors.primaryMuted,
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.mic,
              color: isMine ? Colors.white : AppColors.primary, size: 16),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 150,
          height: 30,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              for (var i = 0; i < bars.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Container(
                    width: 3,
                    height: bars[i],
                    decoration: BoxDecoration(
                      color: i < 5 ? active : inactive,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SoloMessageBubble extends StatelessWidget {
  final String? code;
  final Message message;
  final List<String>? soloLanguages;
  final String? stageLabel;
  final String time;
  final bool autoplay;
  final bool playTranslatedAudio;
  final VoidCallback? onRetry;

  const _SoloMessageBubble({
    required this.code,
    required this.message,
    required this.soloLanguages,
    required this.stageLabel,
    required this.time,
    required this.autoplay,
    required this.playTranslatedAudio,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final langs = soloLanguages ?? [message.senderLang, message.targetLang];
    // Solo: emitter = the toggle side that spoke, receiver = the other side.
    final view = MessageView.of(message, isSolo: true, soloLanguages: langs);
    final isA = langs.isNotEmpty && view.emitterLang == langs.first;
    final emitterInfo = getLang(view.emitterLang);
    final receiverInfo = getLang(view.receiverLang);
    final hasTranslation = message.translated != message.original;
    final align = isA ? CrossAxisAlignment.start : CrossAxisAlignment.end;
    final sourceColor = isA ? AppColors.card : AppColors.primary;
    final sourceBorder = isA ? Border.all(color: AppColors.border) : null;
    final originalAudio = view.canRecoverOriginal
        ? _audioPayloadFromMap(message.originalAudio)
        : null;
    final translatedAudio = playTranslatedAudio
        ? _audioPayloadFromMap(message.translatedAudio)
        : null;
    // Original audio recovered on demand when there's none inline.
    final showOriginalRecover = message.isAudio &&
        message.hasOriginalAudio &&
        view.canRecoverOriginal &&
        originalAudio == null &&
        code != null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: align,
        children: [
          _langHeader(emitterInfo, muted: true),
          _bubble(
            color: sourceColor,
            border: message.failed
                ? Border.all(color: AppColors.danger)
                : sourceBorder,
            leftTail: isA,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (message.isAudio)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('🎤 Voice',
                        style: TextStyle(color: AppColors.muted, fontSize: 12)),
                  ),
                if (message.isAudio || originalAudio != null) ...[
                  if (originalAudio != null)
                    _AudioWaveformPlayer(
                      primary: originalAudio,
                      fallback: null,
                      isMine: !isA,
                      seed: '${message.id}:source',
                      autoplay: autoplay && translatedAudio == null,
                    )
                  else if (showOriginalRecover)
                    _OriginalAudioRecover(
                        code: code!, msgId: message.id, isMine: !isA)
                  else
                    _FakeWaveform(isMine: !isA, seed: '${message.id}:source'),
                  const SizedBox(height: 8),
                ],
                Text(message.original,
                    style: TextStyle(
                        color: isA ? AppColors.text : Colors.white,
                        fontSize: 16,
                        height: 1.4)),
              ],
            ),
          ),
          if (hasTranslation) ...[
            const SizedBox(height: 8),
            _langHeader(receiverInfo, muted: false),
            _bubble(
              color: AppColors.accent.withValues(alpha: 0.15),
              border:
                  Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
              leftTail: isA,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.isAudio || translatedAudio != null) ...[
                    if (translatedAudio != null)
                      _AudioWaveformPlayer(
                        primary: translatedAudio,
                        fallback: originalAudio,
                        isMine: false,
                        seed: '${message.id}:translated',
                        autoplay: autoplay,
                      )
                    else
                      _FakeWaveform(
                          isMine: false, seed: '${message.id}:translated'),
                    const SizedBox(height: 8),
                  ],
                  Text(message.translated,
                      style: TextStyle(
                          color: AppColors.text, fontSize: 16, height: 1.4)),
                ],
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Text(stageLabel ?? time,
                style: TextStyle(color: AppColors.muted, fontSize: 12)),
          ),
          if (message.failed)
            GestureDetector(
              onTap: onRetry,
              child: Padding(
                padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
                child: Text('⚠ Couldn\'t translate — tap to retry',
                    style: TextStyle(
                        color: AppColors.danger,
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _langHeader(Language info, {required bool muted}) => Padding(
        padding: const EdgeInsets.only(left: 4, right: 4, bottom: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(info.flag, style: TextStyle(fontSize: 16)),
            const SizedBox(width: 6),
            Text(info.name,
                style: TextStyle(
                    color: muted ? AppColors.muted : AppColors.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      );

  Widget _bubble({
    required Color color,
    required Widget child,
    Border? border,
    required bool leftTail,
  }) =>
      LayoutBuilder(
        builder: (context, _) => ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.78,
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color,
              border: border,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(leftTail ? 4 : 16),
                bottomRight: Radius.circular(leftTail ? 16 : 4),
              ),
            ),
            child: child,
          ),
        ),
      );
}

/// Thin gradient bar that crawls 8% → 92% over ~9s (ease-out) while a message
/// is being translated, then disappears when its bubble is replaced. Mirrors
/// the web room's translation progress indicator.
class TranslationProgressBar extends StatefulWidget {
  final Alignment align;
  final double? progress;
  const TranslationProgressBar({
    super.key,
    this.align = Alignment.centerLeft,
    this.progress,
  });

  @override
  State<TranslationProgressBar> createState() => _TranslationProgressBarState();
}

class _TranslationProgressBarState extends State<TranslationProgressBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fill;

  @override
  void initState() {
    super.initState();
    _ctrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 9));
    _fill = Tween<double>(begin: 0.08, end: 0.92)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fixed = widget.progress;
    return Align(
      alignment: widget.align,
      child: Container(
        width: 128,
        height: 4,
        margin: const EdgeInsets.only(top: 6),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white10,
          borderRadius: BorderRadius.circular(999),
        ),
        child: AnimatedBuilder(
          animation: _fill,
          builder: (context, _) => FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor:
                fixed != null ? (fixed.clamp(0, 100) / 100) : _fill.value,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.primary, AppColors.accent],
                ),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
