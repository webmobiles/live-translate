import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../models/language.dart';
import '../models/message.dart';
import '../models/participant.dart';
import '../services/client_log_service.dart';
import '../services/socket_service.dart';
import '../services/solo_api.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/message_bubble.dart';
import '../widgets/participant_list.dart';
import '../widgets/voice_button.dart';

const int _minVoiceMs = 1000;

class RoomScreen extends StatefulWidget {
  final String code;
  final String nickname;
  final String language;
  final String roomName;
  final bool isHost;
  final String mode;
  final List<String>? soloLanguages;

  const RoomScreen({
    super.key,
    required this.code,
    required this.nickname,
    required this.language,
    required this.roomName,
    required this.isHost,
    required this.mode,
    this.soloLanguages,
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

  bool _isRecording = false;
  bool _isConnected = false;
  late String _myLanguage;
  String? _soloActiveLanguage;
  String _mySocketId = '';
  String? _recordingPath;
  int _recordingStartedAt = 0;

  // Failed solo sends kept for one-tap retry (message id → payload).
  final Map<String, _RetryPayload> _retry = {};

  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _myLanguage = widget.language;
    _recorder.hasPermission(); // prompt for mic up front

    if (widget.isSolo) {
      // Solo rooms run over HTTP (single user) — no socket, always "ready".
      final langs = _soloLanguages;
      _soloActiveLanguage = langs.first;
      _myLanguage = _otherSoloLanguage(_soloActiveLanguage!);
      _isConnected = true;
      return;
    }

    final socket = SocketService.getSocket();
    _socket = socket;
    _mySocketId = socket.id ?? '';

    socket.on('connect', _onConnect);
    socket.on('disconnect', _onDisconnect);
    socket.on('room:participants-updated', _onParticipants);
    socket.on('room:participant-joined', _onParticipantJoined);
    socket.on('room:participant-left', _onParticipantLeft);
    socket.on('message:translating', _onTranslating);
    socket.on('message:incoming', _onIncoming);
    socket.on('message:error', _onMessageError);

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
      socket.off('message:incoming', _onIncoming);
      socket.off('message:error', _onMessageError);
    }
    _input.dispose();
    _scroll.dispose();
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
      ));
    });
    _scrollToEnd();
  }

  void _onIncoming(dynamic data) {
    if (!mounted) return;
    final msg = Message.fromJson(Map<String, dynamic>.from(data as Map));
    setState(() {
      _messages.removeWhere((m) => m.id == msg.id);
      _messages.add(msg.copyWith(isTranslating: false));
    });
    _scrollToEnd();
  }

  void _onMessageError(dynamic data) {
    if (!mounted) return;
    final id = data['id'] as String?;
    setState(() => _messages.removeWhere((m) => m.id == id));
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

  void _sendText() {
    final text = _input.text.trim();
    if (text.isEmpty || !_isConnected) return;
    _input.clear();
    setState(() {});
    if (widget.isSolo) {
      _sendTextSolo(text);
      return;
    }
    _socket?.emit('message:text', {'text': text});
  }

  void _copyCode() {
    Clipboard.setData(ClipboardData(text: widget.code));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Room code ${widget.code} copied to clipboard')),
    );
  }

  // ── Voice recording ─────────────────────────────────────────────────────────
  Future<void> _startRecording() async {
    try {
      if (!await _recorder.hasPermission()) {
        _snack('Microphone permission required');
        return;
      }
      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      _recordingPath = path;
      _recordingStartedAt = DateTime.now().millisecondsSinceEpoch;
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
      _recordingStartedAt = 0;
      final filePath = path ?? _recordingPath;
      _recordingPath = null;
      if (filePath == null) return;

      final file = File(filePath);
      if (durationMs < _minVoiceMs) {
        _snack('Send voice at least 1 second duration.');
        if (await file.exists()) await file.delete();
        return;
      }

      final bytes = await file.readAsBytes();
      final base64Audio = base64Encode(bytes);
      if (await file.exists()) await file.delete();
      if (widget.isSolo) {
        await _sendAudioSolo(base64Audio, durationMs);
        return;
      }
      _socket?.emit('message:audio', {
        'audioBase64': base64Audio,
        'mimeType': 'audio/m4a',
        'durationMs': durationMs,
      });
    } catch (e) {
      debugPrint('stopAndSend $e');
      _recordingStartedAt = 0;
      _recordingPath = null;
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  List<String> get _soloLanguages {
    final langs = widget.soloLanguages;
    if (langs != null && langs.length >= 2) return [langs[0], langs[1]];
    return ['es', widget.language];
  }

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
      ));
    });
    _scrollToEnd();
    try {
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
      setState(() {
        _messages.removeWhere((m) => m.id == id);
        _messages.add(msg);
      });
      _scrollToEnd();
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
          _messages[i] = _messages[i]
              .copyWith(isTranslating: false, failed: true, error: e.toString());
        }
      });
      _snack('Translation failed: $e');
    }
  }

  Future<void> _sendAudioSolo(String audioBase64, int durationMs,
      {String? senderLangOverride}) async {
    final id = SoloApi.newId();
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
    // Optimistic "…" bubble until transcription + translation return.
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
      ));
    });
    _scrollToEnd();
    try {
      final msg = await SoloApi.sendAudio(
        code: widget.code,
        audioBase64: audioBase64,
        mimeType: 'audio/m4a',
        durationMs: durationMs,
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
      setState(() {
        _messages.removeWhere((m) => m.id == id);
        _messages.add(msg);
      });
      _scrollToEnd();
    } catch (e) {
      if (!mounted) return;
      ClientLogService.error('client.solo.audio.error', {
        'code': widget.code,
        'error': e.toString(),
      });
      _retry[id] = _RetryPayload(
        isAudio: true,
        audioBase64: audioBase64,
        durationMs: durationMs,
        senderLang: senderLang,
        targetLang: targetLang,
      );
      setState(() {
        final i = _messages.indexWhere((m) => m.id == id);
        if (i >= 0) {
          _messages[i] = _messages[i]
              .copyWith(isTranslating: false, failed: true, error: e.toString());
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
      body: SafeArea(
        child: Column(
          children: [
            _header(),
            if (widget.isSolo)
              _soloLanguageToggle()
            else
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
                              margin: const EdgeInsets.symmetric(vertical: 8),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(m.original,
                                  style: const TextStyle(
                                      color: AppColors.muted, fontSize: 12)),
                            ),
                          );
                        }
                        return MessageBubble(
                          message: m,
                          onRetry: m.failed ? () => _retrySolo(m.id) : null,
                        );
                      },
                    ),
            ),
            _inputBar(hasText),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child:
                  Text('←', style: TextStyle(color: AppColors.muted, fontSize: 20)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.roomName.isNotEmpty ? widget.roomName : widget.code,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 16),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (!widget.isSolo) ...[
                      GestureDetector(
                        onTap: _copyCode,
                        child: Text('${widget.code} 📋',
                            style: const TextStyle(
                                color: AppColors.accent,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(width: 8),
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
                    const SizedBox(width: 6),
                    Text(_isConnected ? 'Live' : 'Reconnecting…',
                        style: const TextStyle(
                            color: AppColors.muted, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
          if (!widget.isSolo)
            LanguageBadge(
              code: _myLanguage,
              onTap: () async {
                final code =
                    await showLanguagePicker(context, selected: _myLanguage);
                if (code != null) setState(() => _myLanguage = code);
              },
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
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        children: [
          Container(
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                AnimatedAlign(
                  alignment:
                      isA ? Alignment.centerLeft : Alignment.centerRight,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  child: FractionallySizedBox(
                    widthFactor: 0.5,
                    heightFactor: 1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: _isConnected
                            ? AppColors.primary
                            : AppColors.primaryMuted,
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
                        onTap: () => _setSoloActiveLanguage(langA.code),
                      ),
                    ),
                    const SizedBox(
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
                        onTap: () => _setSoloActiveLanguage(langB.code),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Tap the language that is speaking',
            style: TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _soloToggleSide({
    required Language info,
    required bool active,
    required bool leftSide,
    required VoidCallback onTap,
  }) {
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
        ? const Text(
            'SPEAKING',
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

    return GestureDetector(
      onTap: _isConnected ? onTap : null,
      child: Opacity(
        opacity: _isConnected ? 1 : 0.45,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: leftSide
                ? [
                    Text(info.flag, style: const TextStyle(fontSize: 24)),
                    const SizedBox(width: 8),
                    label,
                  ]
                : [
                    label,
                    const SizedBox(width: 8),
                    Text(info.flag, style: const TextStyle(fontSize: 24)),
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
          children: const [
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
      decoration: const BoxDecoration(
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
                style: const TextStyle(color: Colors.white, fontSize: 16),
                cursorColor: AppColors.primary,
                decoration: InputDecoration(
                  hintText: 'Message in ${_myLanguage.toUpperCase()}…',
                  hintStyle: const TextStyle(color: AppColors.muted),
                  filled: true,
                  fillColor: AppColors.card,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: AppColors.primary),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          hasText
              ? GestureDetector(
                  onTap: _isConnected ? _sendText : null,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: const Text('↑',
                        style: TextStyle(color: Colors.white, fontSize: 20)),
                  ),
                )
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
