import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';
import '../models/language.dart';
import '../models/message.dart';
import '../models/message_view.dart';
import '../models/participant.dart';
import '../services/client_log_service.dart';
import '../services/socket_service.dart';
import '../services/solo_api.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/message_bubble.dart';
import '../widgets/participant_list.dart';
import '../widgets/voice_button.dart';

const int _minVoiceMs = 400;

class RoomScreen extends StatefulWidget {
  final String code;
  final String nickname;
  final String language;
  final String roomName;
  final bool isHost;
  final String mode;
  final List<String>? soloLanguages;
  final bool initialTranslatedAudio;
  final Map<String, dynamic>? initialConfig;

  const RoomScreen({
    super.key,
    required this.code,
    required this.nickname,
    required this.language,
    required this.roomName,
    required this.isHost,
    required this.mode,
    this.soloLanguages,
    this.initialTranslatedAudio = true,
    this.initialConfig,
  });

  bool get isSolo => mode == 'solo_multilang';

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  final List<Message> _messages = [];
  List<Participant> _participants = [];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _recorder = AudioRecorder();

  // Debug: live mic level during a recording, so silent captures are visible
  // in the logs (dBFS — near 0 is loud, < -50 is effectively silence).
  StreamSubscription<Amplitude>? _ampSub;
  double _ampPeak = -160.0;

  bool _isRecording = false;
  bool _isConnected = false;
  bool _autoplayVoice = true;
  bool _translatedAudio = true;
  bool _soloStopRequested = false;
  late String _myLanguage;
  String? _soloActiveLanguage;
  String? _soloPressedLanguage;
  String? _autoplayMessageId;
  late Map<String, dynamic> _roomConfig;
  String _mySocketId = '';
  String? _recordingPath;
  int _recordingStartedAt = 0;
  // Pre-warmed so a hold-to-record press starts the mic immediately instead of
  // awaiting permission + temp-dir lookups each time (which lost short presses).
  String? _tempDirPath;
  bool _micGranted = false;

  // Failed solo sends kept for one-tap retry (message id → payload).
  final Map<String, _RetryPayload> _retry = {};

  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _myLanguage = widget.language;
    _translatedAudio = widget.initialTranslatedAudio;
    _roomConfig = _defaultRoomConfig();
    _prewarmRecorder(); // prompt for mic + cache temp dir so recording starts fast

    if (widget.isSolo) {
      final langs = _soloLanguages;
      _soloActiveLanguage = langs.first;
      _myLanguage = _otherSoloLanguage(_soloActiveLanguage!);
    }

    if (widget.isSolo && !kPhoneSoloRoomSocket) {
      // HTTP solo mode: no live socket needed.
      _isConnected = true;
      return;
    }

    final socket = SocketService.connect();
    _socket = socket;
    _mySocketId = socket.id ?? '';

    socket.on('connect', _onConnect);
    socket.on('disconnect', _onDisconnect);
    socket.on('room:participants-updated', _onParticipants);
    socket.on('room:participant-joined', _onParticipantJoined);
    socket.on('room:participant-left', _onParticipantLeft);
    socket.on('message:translating', _onTranslating);
    socket.on('message:progress', _onMessageProgress);
    socket.on('message:incoming', _onIncoming);
    socket.on('message:error', _onMessageError);
    socket.on('message:delivered', _onMessageDelivered);
    socket.on('message:read', _onMessageRead);
    socket.on('room:config-updated', _onConfigUpdated);

    _isConnected = socket.connected;
  }

  @override
  void dispose() {
    final socket = _socket;
    if (socket != null) {
      socket.off('connect', _onConnect);
      socket.off('disconnect', _onDisconnect);
      socket.off('room:participants-updated', _onParticipants);
      socket.off('room:participant-joined', _onParticipantJoined);
      socket.off('room:participant-left', _onParticipantLeft);
      socket.off('message:translating', _onTranslating);
      socket.off('message:progress', _onMessageProgress);
      socket.off('message:incoming', _onIncoming);
      socket.off('message:error', _onMessageError);
      socket.off('message:delivered', _onMessageDelivered);
      socket.off('message:read', _onMessageRead);
      socket.off('room:config-updated', _onConfigUpdated);
    }
    _input.dispose();
    _scroll.dispose();
    _ampSub?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  // ── Socket handlers ─────────────────────────────────────────────────────────
  void _onConnect(dynamic _) {
    if (!mounted) return;
    setState(() {
      _isConnected = true;
      _mySocketId = _socket?.id ?? '';
    });
  }

  void _onDisconnect(dynamic _) {
    if (!mounted) return;
    setState(() => _isConnected = false);
  }

  void _onParticipants(dynamic data) {
    if (!mounted) return;
    final list = (data?['participants'] as List? ?? [])
        .map((e) => Participant.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    setState(() => _participants = list);
  }

  void _onParticipantJoined(dynamic data) {
    final p = Participant.fromJson(
        Map<String, dynamic>.from(data['participant'] as Map));
    _addSystemMsg('${p.nickname} joined (${p.language.toUpperCase()})');
  }

  void _onParticipantLeft(dynamic data) {
    if (!mounted) return;
    final socketId = data['socketId'] as String?;
    final leaving = _participants
        .where((p) => p.socketId == socketId)
        .cast<Participant?>()
        .firstWhere((_) => true, orElse: () => null);
    setState(() {
      if (leaving != null) {
        _messages.add(_systemMessage('${leaving.nickname} left'));
      }
      _participants =
          _participants.where((p) => p.socketId != socketId).toList();
    });
    _scrollToEnd();
  }

  void _onTranslating(dynamic data) {
    if (!mounted) return;
    final id = data['id'] as String;
    if (_messages.any((m) => m.id == id)) return;
    setState(() {
      _messages.add(Message(
        id: id,
        original: '…',
        translated: '…',
        sender: '',
        senderLang: _myLanguage,
        targetLang: _myLanguage,
        isMine: false,
        timestamp: DateTime.now().millisecondsSinceEpoch,
        isTranslating: true,
        progressStage: 'received',
      ));
    });
    _scrollToEnd();
  }

  void _onMessageProgress(dynamic data) {
    if (!mounted || data is! Map) return;
    final map = Map<String, dynamic>.from(data);
    final id = map['id'] as String?;
    if (id == null) return;
    final progress = (map['progress'] as num?)?.toDouble();
    final stage = map['stage'] as String?;
    setState(() {
      final i = _messages.indexWhere((m) => m.id == id);
      if (i >= 0) {
        _messages[i] = _messages[i].copyWith(
          progress: progress,
          progressStage: stage,
        );
      }
    });
  }

  void _onIncoming(dynamic data) {
    if (!mounted) return;
    final msg = Message.fromJson(Map<String, dynamic>.from(data as Map));
    // The server echo may not carry isMine, but our optimistic local copy did —
    // preserve it so own messages stay "mine" (don't autoplay back to the sender).
    final wasMine = _messages.any((m) => m.id == msg.id && m.isMine);
    final resolved = msg.copyWith(
      isMine: msg.isMine || wasMine,
      isTranslating: false,
      deliveryStatus: 'delivered',
    );
    final autoPlay = _shouldAutoplay(resolved);
    setState(() {
      final i = _messages.indexWhere((m) => m.id == resolved.id);
      if (i >= 0) {
        _messages[i] = resolved.copyWith(
          originalAudio: resolved.originalAudio ?? _messages[i].originalAudio,
          translatedAudio:
              resolved.translatedAudio ?? _messages[i].translatedAudio,
          clearProgress: true,
        );
      } else {
        _messages.add(resolved);
      }
      if (autoPlay) _autoplayMessageId = resolved.id;
    });
    if (autoPlay) _clearAutoplayAfter(resolved.id);
    _scrollToEnd();
  }

  void _onMessageError(dynamic data) {
    if (!mounted) return;
    final id = data['id'] as String?;
    setState(() {
      final i = _messages.indexWhere((m) => m.id == id);
      if (i >= 0) {
        _messages[i] = _messages[i].copyWith(
          isTranslating: false,
          failed: true,
          deliveryStatus: 'failed',
          clearProgress: true,
        );
      }
    });
  }

  void _onMessageDelivered(dynamic data) {
    if (!mounted || data is! Map) return;
    final id = data['id'] as String?;
    if (id == null) return;
    setState(() {
      final i = _messages.indexWhere((m) => m.id == id);
      if (i >= 0) {
        _messages[i] = _messages[i].copyWith(deliveryStatus: 'delivered');
      }
    });
  }

  void _onMessageRead(dynamic data) {
    if (!mounted || data is! Map) return;
    final id = data['id'] as String?;
    if (id == null) return;
    setState(() {
      final i = _messages.indexWhere((m) => m.id == id);
      if (i >= 0) {
        _messages[i] = _messages[i].copyWith(deliveryStatus: 'read');
      }
    });
  }

  void _onConfigUpdated(dynamic data) {
    if (!mounted || data is! Map) return;
    final config = data['config'];
    if (config is! Map) return;
    final output = config['output'];
    final translatedAudio =
        output is Map ? output['translatedAudio'] as bool? : null;
    if (translatedAudio == null) return;
    setState(() {
      _translatedAudio = translatedAudio;
      _roomConfig = Map<String, dynamic>.from(config);
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  Message _systemMessage(String text) => Message(
        id: 'sys-${DateTime.now().millisecondsSinceEpoch}',
        original: text,
        translated: text,
        sender: 'system',
        senderLang: 'en',
        targetLang: 'en',
        isMine: false,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

  void _addSystemMsg(String text) {
    if (!mounted) return;
    setState(() => _messages.add(_systemMessage(text)));
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _updateMessageProgress(String id, {double? progress, String? stage}) {
    if (!mounted) return;
    setState(() {
      final i = _messages.indexWhere((m) => m.id == id);
      if (i >= 0) {
        _messages[i] = _messages[i].copyWith(
          progress: progress,
          progressStage: stage,
        );
      }
    });
  }

  bool _isPlayableAudio(Map<String, dynamic>? audio) {
    final audioBase64 = audio?['audioBase64'];
    final mimeType = audio?['mimeType'];
    return audioBase64 is String &&
        audioBase64.isNotEmpty &&
        mimeType is String &&
        mimeType.isNotEmpty;
  }

  bool _canUseOriginalAudio(Message message) =>
      message.isMine || message.senderLang == message.targetLang;

  bool _hasPlayableAudio(Message message) =>
      (_translatedAudio && _isPlayableAudio(message.translatedAudio)) ||
      (_canUseOriginalAudio(message) &&
          _isPlayableAudio(message.originalAudio));

  bool _shouldAutoplay(Message message) {
    if (!_autoplayVoice) return false;
    // Autoplay = the receiver half (translated audio). Solo plays it out loud on
    // the shared device; in a normal room only receivers hear it — the emitter
    // never has their own message replayed. See MessageView / README roles.
    final view = MessageView.of(message,
        isSolo: widget.isSolo,
        soloLanguages: widget.isSolo ? _soloLanguages : null);
    if (widget.isSolo) {
      return _translatedAudio && _isPlayableAudio(message.translatedAudio);
    }
    if (view.viewerIsEmitter) return false;
    return _hasPlayableAudio(message);
  }

  void _clearAutoplayAfter(String id) {
    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted || _autoplayMessageId != id) return;
      setState(() => _autoplayMessageId = null);
    });
  }

  Map<String, dynamic> _defaultRoomConfig() => Map<String, dynamic>.from(
        widget.initialConfig ??
            {
              'mode': widget.mode,
              'soloLanguages': widget.isSolo ? _soloLanguages : null,
              'guestDefaultLanguage': null,
              'input': {'text': true, 'voice': true},
              'voicePipeline': 'stt-text-translate',
              'output': {
                'translatedText': true,
                'translatedAudio': widget.initialTranslatedAudio,
              },
            },
      );

  Map<String, dynamic> _roomConfigWithTranslatedAudio(bool enabled) {
    final next = Map<String, dynamic>.from(_roomConfig);
    final output = Map<String, dynamic>.from(
      next['output'] is Map ? next['output'] as Map : const {},
    );
    output['translatedAudio'] = enabled;
    output['translatedText'] = output['translatedText'] ?? true;
    next['output'] = output;
    next['mode'] = next['mode'] ?? widget.mode;
    if (widget.isSolo) next['soloLanguages'] = _soloLanguages;
    return next;
  }

  void _setTranslatedAudio(bool enabled) {
    final previous = _translatedAudio;
    final previousConfig = Map<String, dynamic>.from(_roomConfig);
    final nextConfig = _roomConfigWithTranslatedAudio(enabled);
    setState(() {
      _translatedAudio = enabled;
      _roomConfig = nextConfig;
    });

    if (widget.isSolo && !kPhoneSoloRoomSocket) {
      SoloApi.updateConfig(
        code: widget.code,
        config: nextConfig,
      ).catchError((_) {
        if (mounted) {
          setState(() {
            _translatedAudio = previous;
            _roomConfig = previousConfig;
          });
        }
      });
      return;
    }

    final socket = _socket;
    if (socket == null || !widget.isHost) return;
    socket.emitWithAck(
      'room:update-config',
      {'config': nextConfig},
      ack: (ack) {
        if (!mounted) return;
        final res = SocketService.unwrapAck(ack);
        if (res['ok'] != true) {
          setState(() {
            _translatedAudio = previous;
            _roomConfig = previousConfig;
          });
        }
      },
    );
  }

  void _sendText() {
    final text = _input.text.trim();
    if (text.isEmpty || !_isConnected) return;
    _input.clear();
    setState(() {});
    if (widget.isSolo && !kPhoneSoloRoomSocket) {
      _sendTextSolo(text);
      return;
    }
    final id = SoloApi.newId();
    final senderLang = widget.isSolo
        ? (_soloActiveLanguage ?? _soloLanguages.first)
        : _myLanguage;
    final targetLang =
        widget.isSolo ? _otherSoloLanguage(senderLang) : _myLanguage;
    final now = DateTime.now().millisecondsSinceEpoch;
    setState(() {
      _messages.add(Message(
        id: id,
        original: text,
        translated: text,
        sender: widget.nickname,
        senderLang: senderLang,
        targetLang: targetLang,
        isMine: true,
        timestamp: now,
        deliveryStatus: 'sending',
        progress: 10,
        progressStage: 'sending',
      ));
    });
    _scrollToEnd();
    final payload = <String, dynamic>{
      'text': text,
      'clientMsgId': id,
    };
    if (widget.isSolo) payload['senderLang'] = senderLang;
    _socket?.emitWithAck('message:text', {
      ...payload,
    }, ack: (ack) {
      if (!mounted) return;
      final res = SocketService.unwrapAck(ack);
      setState(() {
        final i = _messages.indexWhere((m) => m.id == id);
        if (i < 0) return;
        _messages[i] = _messages[i].copyWith(
          deliveryStatus: res['ok'] == true ? 'queued' : 'failed',
          failed: res['ok'] != true,
          progressStage:
              res['ok'] == true ? 'received' : _messages[i].progressStage,
          clearProgress: res['ok'] != true,
        );
      });
    });
  }

  void _copyCode() {
    Clipboard.setData(ClipboardData(text: widget.code));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Room code ${widget.code} copied to clipboard')),
    );
  }

  // ── Voice recording ─────────────────────────────────────────────────────────
  Future<void> _prewarmRecorder() async {
    try {
      _micGranted = await _recorder.hasPermission();
    } catch (_) {}
    try {
      final dir = await getTemporaryDirectory();
      if (mounted) _tempDirPath = dir.path;
    } catch (_) {}
  }

  Future<void> _startRecording() async {
    try {
      if (!_micGranted) {
        _micGranted = await _recorder.hasPermission();
        if (!_micGranted) {
          _snack('Microphone permission required');
          return;
        }
      }
      final dirPath = _tempDirPath ??= (await getTemporaryDirectory()).path;
      final path =
          '$dirPath/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        // Mono 16 kHz: what Whisper wants anyway, and avoids the silent-capture
        // some Android devices hit when asked for stereo from a mono mic.
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          numChannels: 1,
          sampleRate: 16000,
        ),
        path: path,
      );
      _recordingPath = path;
      _recordingStartedAt = DateTime.now().millisecondsSinceEpoch;
      // Watch input level so we can see in the logs whether the mic is
      // actually picking up sound (vs. recording digital silence).
      _ampPeak = -160.0;
      _ampSub?.cancel();
      _ampSub = _recorder
          .onAmplitudeChanged(const Duration(milliseconds: 200))
          .listen((amp) {
        if (amp.current > _ampPeak) _ampPeak = amp.current;
        debugPrint('mic level: current=${amp.current.toStringAsFixed(1)} dBFS '
            'peak=${_ampPeak.toStringAsFixed(1)} dBFS');
      });
      setState(() => _isRecording = true);
    } catch (e) {
      debugPrint('startRecording $e');
    }
  }

  Future<void> _stopAndSend() async {
    if (_recordingPath == null) return;
    setState(() => _isRecording = false);
    try {
      final durationMs = _recordingStartedAt > 0
          ? DateTime.now().millisecondsSinceEpoch - _recordingStartedAt
          : 0;
      final path = await _recorder.stop();
      await _ampSub?.cancel();
      _ampSub = null;
      debugPrint('recording stopped: peak mic level '
          '${_ampPeak.toStringAsFixed(1)} dBFS '
          '(${_ampPeak < -50 ? 'SILENT — mic captured no signal' : 'has signal'})');
      _recordingStartedAt = 0;
      final filePath = path ?? _recordingPath;
      _recordingPath = null;
      if (filePath == null) return;

      final file = File(filePath);
      if (durationMs < _minVoiceMs) {
        _snack('Hold a little longer to record.');
        if (await file.exists()) await file.delete();
        return;
      }

      final id = SoloApi.newId();
      final senderLang = widget.isSolo
          ? (_soloActiveLanguage ?? _soloLanguages.first)
          : _myLanguage;
      final targetLang =
          widget.isSolo ? _otherSoloLanguage(senderLang) : _myLanguage;
      final now = DateTime.now().millisecondsSinceEpoch;
      setState(() {
        _messages.add(Message(
          id: id,
          original: '…',
          translated: '…',
          sender: widget.nickname,
          senderLang: senderLang,
          targetLang: targetLang,
          isMine: true,
          isAudio: true,
          timestamp: now,
          isTranslating: true,
          deliveryStatus: 'sending',
          progress: 5,
          progressStage: 'preparingAudio',
        ));
      });
      _scrollToEnd();

      final bytes = await file.readAsBytes();
      _updateMessageProgress(id, progress: 10, stage: 'encodingAudio');
      final base64Audio = base64Encode(bytes);
      _updateMessageProgress(id, progress: 18, stage: 'sendingAudio');
      if (await file.exists()) await file.delete();
      if (widget.isSolo && !kPhoneSoloRoomSocket) {
        await _sendAudioSolo(base64Audio, durationMs,
            id: id, senderLangOverride: senderLang);
        return;
      }
      final payload = <String, dynamic>{
        'audioBase64': base64Audio,
        'mimeType': 'audio/m4a',
        'durationMs': durationMs,
        'clientMsgId': id,
      };
      if (widget.isSolo) payload['senderLang'] = senderLang;
      _socket?.emit('message:audio', payload);
    } catch (e) {
      debugPrint('stopAndSend $e');
      await _ampSub?.cancel();
      _ampSub = null;
      _recordingStartedAt = 0;
      _recordingPath = null;
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    // Top toast (instead of a bottom SnackBar) so it doesn't sit over the input.
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (ctx) => Positioned(
        top: MediaQuery.of(ctx).padding.top + 12,
        left: 16,
        right: 16,
        child: IgnorePointer(
          child: Material(
            color: Colors.transparent,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                msg,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.text,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(milliseconds: 2500), () {
      if (entry.mounted) entry.remove();
    });
  }

  List<String> get _soloLanguages {
    final langs = widget.soloLanguages;
    if (langs != null && langs.length >= 2) return [langs[0], langs[1]];
    return ['es', widget.language];
  }

  /// Language the user is currently typing in (shown in the input placeholder).
  /// In solo mode this follows the toggle's active side; otherwise it's the
  /// user's own language.
  String get _inputLanguage => widget.isSolo
      ? (_soloActiveLanguage ?? _soloLanguages.first)
      : _myLanguage;

  String _otherSoloLanguage(String activeLanguage) {
    final langs = _soloLanguages;
    return langs.firstWhere((lang) => lang != activeLanguage,
        orElse: () => langs.last);
  }

  void _setSoloActiveLanguage(String code) {
    setState(() {
      _soloActiveLanguage = code;
      _myLanguage = _otherSoloLanguage(code);
    });
  }

  Future<void> _startSoloLanguageRecording(String code) async {
    if (!_isConnected || _isRecording) return;
    _soloStopRequested = false;
    setState(() => _soloPressedLanguage = code);
    _setSoloActiveLanguage(code);
    HapticFeedback.mediumImpact();
    await _startRecording();
    if (_soloStopRequested && _isRecording) {
      _soloStopRequested = false;
      await _stopAndSend();
    }
  }

  void _stopSoloLanguageRecording(String code) {
    HapticFeedback.lightImpact();
    if (_soloPressedLanguage == code) {
      setState(() => _soloPressedLanguage = null);
    }
    if (_isRecording) {
      _stopAndSend();
    } else {
      _soloStopRequested = true;
    }
  }

  // Phase 2 (solo HTTP): fetch the translated TTS audio after the text is shown,
  // then attach it to the message and autoplay it. Keeps the text fast.
  Future<void> _fetchSoloAudio(Message msg) async {
    try {
      final audio = await SoloApi.fetchTranslatedAudio(
        code: widget.code,
        msgId: msg.id,
        lang: msg.targetLang,
        text: msg.translated,
      );
      if (!mounted) return;
      setState(() {
        final i = _messages.indexWhere((m) => m.id == msg.id);
        if (i < 0) return;
        final updated =
            _messages[i].copyWith(translatedAudio: audio, audioPending: false);
        _messages[i] = updated;
        if (audio != null && _shouldAutoplay(updated)) {
          _autoplayMessageId = updated.id;
        }
      });
      if (_autoplayMessageId == msg.id) _clearAutoplayAfter(msg.id);
    } catch (_) {
      if (!mounted) return;
      // Text already delivered; just stop showing the audio-pending state.
      setState(() {
        final i = _messages.indexWhere((m) => m.id == msg.id);
        if (i >= 0) _messages[i] = _messages[i].copyWith(audioPending: false);
      });
    }
  }

  // ── Solo send (HTTP, no socket) ─────────────────────────────────────────────
  Future<void> _sendTextSolo(String text, {String? senderLangOverride}) async {
    final id = SoloApi.newId();
    final senderLang =
        senderLangOverride ?? _soloActiveLanguage ?? _soloLanguages.first;
    final targetLang = _otherSoloLanguage(senderLang);
    final now = DateTime.now().millisecondsSinceEpoch;
    ClientLogService.info('client.solo.text.send', {
      'code': widget.code,
      'senderLang': senderLang,
      'targetLang': targetLang,
      'textLength': text.length,
    });
    // Optimistic bubble showing the typed text while translation runs.
    setState(() {
      _messages.add(Message(
        id: id,
        original: text,
        translated: text,
        sender: widget.nickname,
        senderLang: senderLang,
        targetLang: targetLang,
        isMine: true,
        timestamp: now,
        isTranslating: true,
        deliveryStatus: 'sending',
        progress: 10,
        progressStage: 'sending',
      ));
    });
    _scrollToEnd();
    try {
      _updateMessageProgress(id, progress: 25, stage: 'received');
      _updateMessageProgress(id, progress: 45, stage: 'translating');
      final msg = await SoloApi.sendText(
        code: widget.code,
        text: text,
        clientMsgId: id,
        sender: widget.nickname,
        senderLang: senderLang,
        targetLang: targetLang,
      );
      if (!mounted) return;
      ClientLogService.info('client.solo.text.translated', {
        'code': widget.code,
        'id': msg.id,
        'translatedLength': msg.translated.length,
      });
      final autoPlay = _shouldAutoplay(msg);
      setState(() {
        _messages.removeWhere((m) => m.id == id);
        _messages.add(msg.copyWith(deliveryStatus: 'delivered'));
        if (autoPlay) _autoplayMessageId = msg.id;
      });
      if (autoPlay) _clearAutoplayAfter(msg.id);
      _scrollToEnd();
      // Phase 2: text is shown; now fetch the audio in a second request.
      if (msg.audioPending) _fetchSoloAudio(msg);
    } catch (e) {
      if (!mounted) return;
      ClientLogService.error('client.solo.text.error', {
        'code': widget.code,
        'error': e.toString(),
      });
      _retry[id] = _RetryPayload(
        isAudio: false,
        text: text,
        senderLang: senderLang,
        targetLang: targetLang,
      );
      setState(() {
        final i = _messages.indexWhere((m) => m.id == id);
        if (i >= 0) {
          _messages[i] = _messages[i].copyWith(
            isTranslating: false,
            failed: true,
            error: e.toString(),
            deliveryStatus: 'failed',
            clearProgress: true,
          );
        }
      });
      _snack('Translation failed: $e');
    }
  }

  Future<void> _sendAudioSolo(String audioBase64, int durationMs,
      {String? id, String? senderLangOverride}) async {
    final msgId = id ?? SoloApi.newId();
    final senderLang =
        senderLangOverride ?? _soloActiveLanguage ?? _soloLanguages.first;
    final targetLang = _otherSoloLanguage(senderLang);
    final now = DateTime.now().millisecondsSinceEpoch;
    ClientLogService.info('client.solo.audio.send', {
      'code': widget.code,
      'senderLang': senderLang,
      'targetLang': targetLang,
      'durationMs': durationMs,
      'audioBytesApprox': (audioBase64.length * 0.75).round(),
    });
    if (!_messages.any((m) => m.id == msgId)) {
      setState(() {
        _messages.add(Message(
          id: msgId,
          original: '…',
          translated: '…',
          sender: widget.nickname,
          senderLang: senderLang,
          targetLang: targetLang,
          isMine: true,
          isAudio: true,
          timestamp: now,
          isTranslating: true,
          deliveryStatus: 'sending',
          progress: 18,
          progressStage: 'sendingAudio',
        ));
      });
      _scrollToEnd();
    }
    try {
      _updateMessageProgress(msgId, progress: 25, stage: 'received');
      _updateMessageProgress(msgId, progress: 35, stage: 'transcribing');
      final msg = await SoloApi.sendAudio(
        code: widget.code,
        audioBase64: audioBase64,
        mimeType: 'audio/m4a',
        durationMs: durationMs,
        clientMsgId: msgId,
        sender: widget.nickname,
        senderLang: senderLang,
        targetLang: targetLang,
      );
      if (!mounted) return;
      ClientLogService.info('client.solo.audio.translated', {
        'code': widget.code,
        'id': msg.id,
        'originalLength': msg.original.length,
        'translatedLength': msg.translated.length,
      });
      final autoPlay = _shouldAutoplay(msg);
      setState(() {
        _messages.removeWhere((m) => m.id == msgId);
        _messages.add(msg.copyWith(deliveryStatus: 'delivered'));
        if (autoPlay) _autoplayMessageId = msg.id;
      });
      if (autoPlay) _clearAutoplayAfter(msg.id);
      _scrollToEnd();
      // Phase 2: text is shown; now fetch the audio in a second request.
      if (msg.audioPending) _fetchSoloAudio(msg);
    } catch (e) {
      if (!mounted) return;
      ClientLogService.error('client.solo.audio.error', {
        'code': widget.code,
        'error': e.toString(),
      });
      _retry[msgId] = _RetryPayload(
        isAudio: true,
        audioBase64: audioBase64,
        durationMs: durationMs,
        senderLang: senderLang,
        targetLang: targetLang,
      );
      setState(() {
        final i = _messages.indexWhere((m) => m.id == msgId);
        if (i >= 0) {
          _messages[i] = _messages[i].copyWith(
            isTranslating: false,
            failed: true,
            error: e.toString(),
            deliveryStatus: 'failed',
            clearProgress: true,
          );
        }
      });
      _snack('Voice translation failed: $e');
    }
  }

  void _retrySolo(String id) {
    final payload = _retry.remove(id);
    if (payload == null) return;
    setState(() => _messages.removeWhere((m) => m.id == id));
    if (payload.isAudio) {
      _sendAudioSolo(payload.audioBase64, payload.durationMs,
          senderLangOverride: payload.senderLang);
    } else {
      _sendTextSolo(payload.text, senderLangOverride: payload.senderLang);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final hasText = _input.text.trim().isNotEmpty;

    return Scaffold(
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              children: [
                _header(),
                _audioControls(),
                if (!widget.isSolo)
                  ParticipantList(
                      participants: _participants, mySocketId: _mySocketId),
                Expanded(
                  child: _messages.isEmpty
                      ? _emptyState()
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (ctx, i) {
                            final m = _messages[i];
                            if (m.isSystem) {
                              return Center(
                                child: Container(
                                  margin:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppColors.card,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(m.original,
                                      style: TextStyle(
                                          color: AppColors.muted,
                                          fontSize: 12)),
                                ),
                              );
                            }
                            return MessageBubble(
                              code: widget.code,
                              message: m,
                              isSolo: widget.isSolo,
                              soloLanguages:
                                  widget.isSolo ? _soloLanguages : null,
                              autoplay: _autoplayMessageId == m.id,
                              playTranslatedAudio: _translatedAudio,
                              onRetry: m.failed ? () => _retrySolo(m.id) : null,
                            );
                          },
                        ),
                ),
                _inputBar(hasText),
                // Solo language toggle sits below the input bar so the keyboard
                // doesn't push it off-screen / hide the chat.
                if (widget.isSolo) _soloLanguageToggle(),
              ],
            ),
          ),
          // Centered recording-duration counter — shown only while holding to
          // record, removed on release.
          if (_isRecording)
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: _RecordingCounter(startedAtMs: _recordingStartedAt),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Text('←',
                  style: TextStyle(color: AppColors.muted, fontSize: 20)),
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.roomName.isNotEmpty ? widget.roomName : widget.code,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.text,
                      fontWeight: FontWeight.bold,
                      fontSize: 16),
                ),
                SizedBox(height: 2),
                Row(
                  children: [
                    if (!widget.isSolo) ...[
                      GestureDetector(
                        onTap: _copyCode,
                        child: Text('${widget.code} 📋',
                            style: TextStyle(
                                color: AppColors.accent,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.bold)),
                      ),
                      SizedBox(width: 8),
                    ],
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color:
                            _isConnected ? AppColors.accent : AppColors.danger,
                        shape: BoxShape.circle,
                      ),
                    ),
                    SizedBox(width: 6),
                    Text(_isConnected ? 'Live' : 'Reconnecting…',
                        style: TextStyle(color: AppColors.muted, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _soloLanguageToggle() {
    final langs = _soloLanguages;
    final langA = getLang(langs[0]);
    final langB = getLang(langs[1]);
    final active = _soloActiveLanguage ?? langs[0];
    final isA = active == langA.code;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.bg,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        children: [
          Container(
            height: 86,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                AnimatedAlign(
                  alignment: isA ? Alignment.centerLeft : Alignment.centerRight,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  child: FractionallySizedBox(
                    widthFactor: 0.5,
                    heightFactor: 1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: !_isConnected
                            ? AppColors.primaryMuted
                            : _soloPressedLanguage == active
                                // Recording in progress — turn the active side green.
                                ? const Color(0xFF16A34A)
                                : AppColors.primary,
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: _soloToggleSide(
                        info: langA,
                        active: isA,
                        leftSide: true,
                        onPressIn: () =>
                            _startSoloLanguageRecording(langA.code),
                        onPressOut: () =>
                            _stopSoloLanguageRecording(langA.code),
                      ),
                    ),
                    SizedBox(
                      height: 32,
                      child: VerticalDivider(
                        width: 1,
                        thickness: 1,
                        color: Colors.white12,
                      ),
                    ),
                    Expanded(
                      child: _soloToggleSide(
                        info: langB,
                        active: !isA,
                        leftSide: false,
                        onPressIn: () =>
                            _startSoloLanguageRecording(langB.code),
                        onPressOut: () =>
                            _stopSoloLanguageRecording(langB.code),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Hold the language that is speaking',
            style: TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _audioControls() {
    final s = context.appState;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.bg,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _audioSwitch(
              label: s.t('room.autoplayVoice', fallback: 'Autoplay voice'),
              value: _autoplayVoice,
              onChanged: (value) => setState(() => _autoplayVoice = value),
            ),
          ),
          SizedBox(width: 10),
          Expanded(
            child: _audioSwitch(
              label: s.t('room.config.audioOut', fallback: 'Translated audio'),
              value: _translatedAudio,
              onChanged: _setTranslatedAudio,
            ),
          ),
        ],
      ),
    );
  }

  Widget _audioSwitch({
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => onChanged(!value),
      child: Container(
        height: 38,
        padding: const EdgeInsets.only(left: 10),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: value ? AppColors.accent : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppColors.text,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Transform.scale(
              scale: 0.74,
              child: Switch(
                value: value,
                activeThumbColor: AppColors.accent,
                onChanged: onChanged,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _soloToggleSide({
    required Language info,
    required bool active,
    required bool leftSide,
    required VoidCallback onPressIn,
    required VoidCallback onPressOut,
  }) {
    final pressed = _soloPressedLanguage == info.code;
    final name = Text(
      info.name,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: active ? Colors.white : AppColors.muted,
        fontSize: 14,
        fontWeight: FontWeight.bold,
      ),
    );
    final speaking = active
        ? Text(
            pressed ? 'RECORDING' : 'HOLD TO SPEAK',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          )
        : const SizedBox.shrink();
    final label = Flexible(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment:
            leftSide ? CrossAxisAlignment.start : CrossAxisAlignment.end,
        children: [name, speaking],
      ),
    );

    return Listener(
      onPointerDown: (_) {
        if (_isConnected) onPressIn();
      },
      onPointerUp: (_) {
        if (_isConnected) onPressOut();
      },
      onPointerCancel: (_) {
        if (_isConnected) onPressOut();
      },
      child: Opacity(
        opacity: _isConnected ? 1 : 0.45,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: leftSide
                ? [
                    Text(info.flag, style: TextStyle(fontSize: 24)),
                    SizedBox(width: 8),
                    label,
                  ]
                : [
                    label,
                    SizedBox(width: 8),
                    Text(info.flag, style: TextStyle(fontSize: 24)),
                  ],
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('🌐', style: TextStyle(fontSize: 36)),
            SizedBox(height: 12),
            Text(
              'Send a message or hold the mic button to speak.\n'
              'Everyone gets it in their own language.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.muted, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inputBar(bool hasText) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 112),
              child: TextField(
                controller: _input,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _sendText(),
                enabled: _isConnected,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                style: TextStyle(color: AppColors.text, fontSize: 16),
                cursorColor: AppColors.primary,
                decoration: InputDecoration(
                  hintText: 'Message in ${_inputLanguage.toUpperCase()}…',
                  hintStyle: TextStyle(color: AppColors.muted),
                  filled: true,
                  fillColor: AppColors.card,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: AppColors.primary),
                  ),
                ),
              ),
            ),
          ),
          SizedBox(width: 12),
          hasText
              ? GestureDetector(
                  onTap: _isConnected ? _sendText : null,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text('↑',
                        style: TextStyle(color: Colors.white, fontSize: 20)),
                  ),
                )
              : widget.isSolo
                  ? const SizedBox.shrink()
                  : VoiceButton(
                      isRecording: _isRecording,
                      onPressIn: _startRecording,
                      onPressOut: _stopAndSend,
                      disabled: !_isConnected,
                    ),
        ],
      ),
    );
  }
}

/// Stored details for retrying a failed solo send.
class _RetryPayload {
  final bool isAudio;
  final String text;
  final String audioBase64;
  final int durationMs;
  final String senderLang;
  final String targetLang;
  const _RetryPayload({
    required this.isAudio,
    this.text = '',
    this.audioBase64 = '',
    this.durationMs = 0,
    required this.senderLang,
    required this.targetLang,
  });
}

/// Live mm:ss counter shown centered while a recording is in progress. Runs its
/// own timer so only this widget rebuilds, not the whole room.
class _RecordingCounter extends StatefulWidget {
  final int startedAtMs;
  const _RecordingCounter({required this.startedAtMs});

  @override
  State<_RecordingCounter> createState() => _RecordingCounterState();
}

class _RecordingCounterState extends State<_RecordingCounter> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _elapsed {
    final ms = DateTime.now().millisecondsSinceEpoch - widget.startedAtMs;
    final totalSec = ms < 0 ? 0 : ms ~/ 1000;
    final m = totalSec ~/ 60;
    final s = totalSec % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF16A34A);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 22),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: green, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.mic, color: green, size: 40),
          const SizedBox(height: 10),
          Text(
            _elapsed,
            style: TextStyle(
              color: AppColors.text,
              fontSize: 34,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Recording…',
            style: TextStyle(
              color: AppColors.muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
