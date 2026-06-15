import 'package:flutter/material.dart';

import '../config.dart';
import '../models/room_config.dart';
import '../services/client_log_service.dart';
import '../services/socket_service.dart';
import '../services/solo_api.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/ui.dart';
import 'room_screen.dart';

class CreateScreen extends StatefulWidget {
  const CreateScreen({super.key});

  @override
  State<CreateScreen> createState() => _CreateScreenState();
}

class _CreateScreenState extends State<CreateScreen> {
  String _roomMode = 'normal';
  final _roomName = TextEditingController();
  final _nickname = TextEditingController();
  String _language = 'en';
  String _guestLang = 'en';
  String _soloLangA = 'es';
  String _soloLangB = 'en';
  String _voicePipeline = 'stt-text-translate';
  bool _translatedAudio = true;
  bool _loading = false;

  bool get _isSolo => _roomMode == 'solo_multilang';

  @override
  void dispose() {
    _roomName.dispose();
    _nickname.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _handleCreate() {
    final s = context.appState;
    if (!_isSolo && _nickname.text.trim().isEmpty) {
      _snack(s.t('create.errors.nickRequired'));
      return;
    }
    if (_isSolo && _soloLangA == _soloLangB) {
      _snack(s.t('create.errors.sameLang'));
      return;
    }

    setState(() => _loading = true);

    final config = RoomConfig(
      mode: _roomMode,
      soloLanguages: _isSolo ? [_soloLangA, _soloLangB] : null,
      guestDefaultLanguage: _isSolo ? null : _guestLang,
      inputText: true,
      inputVoice: true,
      voicePipeline: _voicePipeline,
      outputTranslatedText: true,
      outputTranslatedAudio: _translatedAudio,
    );

    // Solo rooms default to HTTP, but can use Socket.IO for parity with web.
    if (_isSolo && !kPhoneSoloRoomSocket) {
      _createSolo(config);
      return;
    }

    final socket = SocketService.connect();

    void doCreate() {
      SocketService.emitWithAckLogged(
        'room:create',
        {
          'name': _isSolo
              ? null
              : (_roomName.text.trim().isEmpty ? null : _roomName.text.trim()),
          'nickname': _isSolo ? 'Solo' : _nickname.text.trim(),
          'language': _isSolo ? _soloLangB : _language,
          'config': config.toJson(),
        },
        ack: (data) {
          final res = SocketService.unwrapAck(data);
          if (!mounted) return;
          setState(() => _loading = false);
          if (res['ok'] == true && res['code'] != null) {
            final room = res['room'] as Map?;
            Navigator.of(context).pushReplacement(MaterialPageRoute(
              builder: (_) => RoomScreen(
                code: res['code'] as String,
                nickname: _isSolo ? 'Solo' : _nickname.text.trim(),
                language: _isSolo ? _soloLangB : _language,
                roomName: (room?['name'] as String?) ?? res['code'] as String,
                isHost: true,
                mode: _isSolo ? 'solo_multilang' : 'normal',
                soloLanguages: _isSolo ? [_soloLangA, _soloLangB] : null,
                initialTranslatedAudio: _translatedAudio,
                initialConfig: config.toJson(),
              ),
            ));
          } else {
            _snack('${s.t('common.error.generic')} ${res['error'] ?? ''}');
          }
        },
      );
    }

    if (socket.connected) {
      doCreate();
    } else {
      socket.once('connect', (_) => doCreate());
      socket.once('connect_error', (_) {
        if (!mounted) return;
        ClientLogService.warn('client.room.create.connect_error', {
          'serverUrl': socket.io.uri,
        });
        setState(() => _loading = false);
        _snack(s.t('common.error.network'));
      });
    }
  }

  Future<void> _createSolo(RoomConfig config) async {
    final s = context.appState;
    try {
      final room = await SoloApi.createRoom(config: config);
      if (!mounted) return;
      setState(() => _loading = false);
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => RoomScreen(
          code: room.code,
          nickname: 'Solo',
          language: _soloLangB,
          roomName: room.name,
          isHost: true,
          mode: 'solo_multilang',
          soloLanguages: [_soloLangA, _soloLangB],
          initialTranslatedAudio: _translatedAudio,
          initialConfig: config.toJson(),
        ),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack('${s.t('common.error.generic')} $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  _BackButton(onTap: () => Navigator.of(context).pop()),
                  const SizedBox(width: 8),
                  Text(s.t('create.title'),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 28),

              // Mode selector
              _label(s.t('create.roomType')),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _ModeCard(
                      emoji: '👥',
                      title: s.t('create.mode.normal'),
                      sub: s.t('create.mode.normalSub'),
                      selected: !_isSolo,
                      onTap: () => setState(() => _roomMode = 'normal'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _ModeCard(
                      emoji: '🔄',
                      title: s.t('create.mode.solo'),
                      sub: s.t('create.mode.soloSub'),
                      selected: _isSolo,
                      onTap: () => setState(() => _roomMode = 'solo_multilang'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),

              if (!_isSolo) ..._normalFields(s),
              if (_isSolo) ..._soloFields(s),

              const SizedBox(height: 28),

              // Options
              _label(s.t('create.options.title')),
              const SizedBox(height: 8),
              AppCard(
                child: Column(
                  children: [
                    _PipelineToggle(
                      value: _voicePipeline,
                      directLabel: s.t('create.options.pipeline.direct'),
                      onChanged: (v) => setState(() => _voicePipeline = v),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(s.t('create.options.translatedAudio'),
                            style: const TextStyle(
                                color: Colors.white, fontSize: 14)),
                        Switch(
                          value: _translatedAudio,
                          activeThumbColor: Colors.white,
                          activeTrackColor: AppColors.primary,
                          inactiveTrackColor: AppColors.border,
                          onChanged: (v) =>
                              setState(() => _translatedAudio = v),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              // Info box
              AppCard(
                color: AppColors.primaryMuted,
                borderColor: AppColors.primary,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isSolo
                          ? s.t('create.info.soloTitle')
                          : s.t('create.info.normalTitle'),
                      style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _isSolo
                          ? s.t('create.info.soloBody')
                          : s.t('create.info.normalBody'),
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 14, height: 1.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              AppButton(
                label: s.t('create.cta'),
                loading: _loading,
                disabled: _isSolo && _soloLangA == _soloLangB,
                onPressed: _handleCreate,
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _normalFields(AppState s) => [
        AppInput(
          label: s.t('create.fields.roomName'),
          hint: s.t('create.fields.roomNamePlaceholder'),
          controller: _roomName,
          maxLength: 40,
        ),
        const SizedBox(height: 20),
        AppInput(
          label: s.t('create.fields.yourName'),
          hint: s.t('create.fields.yourNamePlaceholder'),
          controller: _nickname,
          maxLength: 30,
        ),
        const SizedBox(height: 20),
        _label(s.t('create.fields.yourLanguage')),
        const SizedBox(height: 6),
        _PickerRow(
          text: s.t('create.fields.yourLanguageSub'),
          code: _language,
          onTap: () async {
            final code = await showLanguagePicker(context, selected: _language);
            if (code != null) setState(() => _language = code);
          },
        ),
        const SizedBox(height: 20),
        _label(s.t('create.fields.guestLanguage')),
        const SizedBox(height: 6),
        _PickerRow(
          text: s.t('create.fields.guestLanguageSub'),
          textColor: Colors.white70,
          code: _guestLang,
          onTap: () async {
            final code =
                await showLanguagePicker(context, selected: _guestLang);
            if (code != null) setState(() => _guestLang = code);
          },
        ),
        const SizedBox(height: 6),
        Text(s.t('create.fields.guestLanguageHint'),
            style: const TextStyle(color: AppColors.muted, fontSize: 12)),
      ];

  List<Widget> _soloFields(AppState s) => [
        _label(s.t('create.fields.soloLanguages')),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _SoloLangCard(
                label: s.t('create.fields.personA'),
                code: _soloLangA,
                onTap: () async {
                  final code =
                      await showLanguagePicker(context, selected: _soloLangA);
                  if (code != null) setState(() => _soloLangA = code);
                },
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Text('⇄',
                  style: TextStyle(color: AppColors.muted, fontSize: 24)),
            ),
            Expanded(
              child: _SoloLangCard(
                label: s.t('create.fields.personB'),
                code: _soloLangB,
                onTap: () async {
                  final code =
                      await showLanguagePicker(context, selected: _soloLangB);
                  if (code != null) setState(() => _soloLangB = code);
                },
              ),
            ),
          ],
        ),
        if (_soloLangA == _soloLangB) ...[
          const SizedBox(height: 8),
          Center(
            child: Text(s.t('create.errors.sameLang'),
                style: const TextStyle(color: AppColors.danger, fontSize: 14)),
          ),
        ],
      ];

  Widget _label(String text) => Text(
        text.toUpperCase(),
        style: const TextStyle(
            color: AppColors.muted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: 1),
      );
}

class _BackButton extends StatelessWidget {
  final VoidCallback onTap;
  const _BackButton({required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.all(8),
          child:
              Text('←', style: TextStyle(color: AppColors.muted, fontSize: 24)),
        ),
      );
}

class _ModeCard extends StatelessWidget {
  final String emoji, title, sub;
  final bool selected;
  final VoidCallback onTap;
  const _ModeCard({
    required this.emoji,
    required this.title,
    required this.sub,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryMuted : AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Column(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 24)),
            const SizedBox(height: 8),
            Text(title,
                style: TextStyle(
                    color: selected ? AppColors.primary : Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(sub,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.muted, fontSize: 12, height: 1.3)),
          ],
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  final String text;
  final Color? textColor;
  final String code;
  final VoidCallback onTap;
  const _PickerRow({
    required this.text,
    this.textColor,
    required this.code,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(text,
                style:
                    TextStyle(color: textColor ?? Colors.white, fontSize: 16)),
            LanguageBadge(code: code),
          ],
        ),
      ),
    );
  }
}

class _SoloLangCard extends StatelessWidget {
  final String label, code;
  final VoidCallback onTap;
  const _SoloLangCard(
      {required this.label, required this.code, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(
                    color: AppColors.muted, fontSize: 12, letterSpacing: 1)),
            const SizedBox(height: 8),
            LanguageBadge(code: code),
          ],
        ),
      ),
    );
  }
}

class _PipelineToggle extends StatelessWidget {
  final String value;
  final String directLabel;
  final ValueChanged<String> onChanged;
  const _PipelineToggle({
    required this.value,
    required this.directLabel,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            _seg('stt-text-translate', 'STT + Translate'),
            _seg('direct-voice-translation', directLabel),
          ],
        ),
      ),
    );
  }

  Widget _seg(String key, String text) {
    final active = value == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          color: active ? AppColors.primary : AppColors.card,
          alignment: Alignment.center,
          child: Text(text,
              style: TextStyle(
                  color: active ? Colors.white : AppColors.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
        ),
      ),
    );
  }
}
