import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/socket_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/ui.dart';
import 'room_screen.dart';

class JoinScreen extends StatefulWidget {
  const JoinScreen({super.key});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final _code = TextEditingController();
  final _nickname = TextEditingController();
  String _language = 'en';
  bool _langWasAutoSet = false;
  bool _loading = false;
  bool _peeked = false;
  bool _initialised = false;

  @override
  void initState() {
    super.initState();
    _code.addListener(_onCodeChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    // Pre-fill the saved nickname (editable for this room only, not persisted).
    _nickname.text = context.appState.prefs.nickname;
  }

  @override
  void dispose() {
    _code.removeListener(_onCodeChanged);
    _code.dispose();
    _nickname.dispose();
    super.dispose();
  }

  void _onCodeChanged() {
    final code = _code.text;
    if (code.length != 6) {
      _peeked = false;
      setState(() {}); // refresh CTA enabled state
      return;
    }
    if (_peeked) return;
    _peeked = true;

    final socket = SocketService.connect();
    void doPeek() {
      socket.emitWithAck('room:peek', {'code': code.toUpperCase()},
          ack: (data) {
        final res = SocketService.unwrapAck(data);
        if (!mounted) return;
        if (res['ok'] == true && res['guestDefaultLanguage'] != null) {
          setState(() {
            _language = res['guestDefaultLanguage'] as String;
            _langWasAutoSet = true;
          });
        }
      });
    }

    if (socket.connected) {
      doPeek();
    } else {
      socket.once('connect', (_) => doPeek());
    }
    setState(() {});
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _handleJoin() {
    final s = context.appState;
    if (_code.text.trim().isEmpty) {
      _snack(s.t('join.errors.codeRequired'));
      return;
    }
    if (_nickname.text.trim().isEmpty) {
      _snack(s.t('join.errors.nickRequired'));
      return;
    }

    setState(() => _loading = true);
    final socket = SocketService.connect();

    void doJoin() {
      socket.emitWithAck(
        'room:join',
        {
          'code': _code.text.trim().toUpperCase(),
          'nickname': _nickname.text.trim(),
          'language': _language,
        },
        ack: (data) {
          final res = SocketService.unwrapAck(data);
          if (!mounted) return;
          setState(() => _loading = false);
          if (res['ok'] == true && res['room'] != null) {
            final room = res['room'] as Map;
            final config = room['config'] as Map?;
            final soloLanguages = (config?['soloLanguages'] as List?)
                ?.whereType<String>()
                .toList();
            final output = config?['output'] as Map?;
            final translatedAudio = output?['translatedAudio'] as bool? ?? true;
            Navigator.of(context).pushReplacement(MaterialPageRoute(
              builder: (_) => RoomScreen(
                code: room['code'] as String,
                nickname: _nickname.text.trim(),
                language: _language,
                roomName: room['name'] as String? ?? room['code'] as String,
                isHost: false,
                mode: (config?['mode'] as String?) ?? 'normal',
                soloLanguages:
                    soloLanguages != null && soloLanguages.length >= 2
                        ? soloLanguages.take(2).toList()
                        : null,
                initialTranslatedAudio: translatedAudio,
                initialConfig:
                    config != null ? Map<String, dynamic>.from(config) : null,
              ),
            ));
          } else {
            _snack('${s.t('join.errors.notFound')} ${res['error'] ?? ''}');
          }
        },
      );
    }

    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', (_) => doJoin());
      socket.once('connect_error', (_) {
        if (!mounted) return;
        setState(() => _loading = false);
        _snack(s.t('common.error.network'));
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    final ready = _code.text.length == 6;

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
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text('←',
                          style:
                              TextStyle(color: AppColors.muted, fontSize: 24)),
                    ),
                  ),
                  SizedBox(width: 8),
                  Text(s.t('join.title'),
                      style: TextStyle(
                          color: AppColors.text,
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              SizedBox(height: 32),

              AppInput(
                label: s.t('join.fields.code'),
                hint: s.t('join.fields.codePlaceholder'),
                controller: _code,
                maxLength: 6,
                autofocus: true,
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [UpperCaseTextFormatter()],
                textStyle: TextStyle(
                  color: AppColors.text,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 8,
                ),
              ),
              SizedBox(height: 20),

              AppInput(
                label: s.t('join.fields.yourName'),
                hint: s.t('join.fields.yourNamePlaceholder'),
                controller: _nickname,
                maxLength: 30,
                onChanged: (_) => setState(() {}),
              ),
              SizedBox(height: 20),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(s.t('join.fields.yourLanguage').toUpperCase(),
                      style: TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 1)),
                  if (_langWasAutoSet)
                    Text(s.t('join.fields.suggestedByHost'),
                        style:
                            TextStyle(color: AppColors.primary, fontSize: 12)),
                ],
              ),
              SizedBox(height: 6),
              GestureDetector(
                onTap: () async {
                  final code =
                      await showLanguagePicker(context, selected: _language);
                  if (code != null) setState(() => _language = code);
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(s.t('join.fields.yourLanguageSub'),
                          style:
                              TextStyle(color: AppColors.text, fontSize: 16)),
                      LanguageBadge(code: _language),
                    ],
                  ),
                ),
              ),
              SizedBox(height: 32),

              AppButton(
                label: s.t('join.cta'),
                loading: _loading,
                disabled: !ready,
                variant: ready
                    ? AppButtonVariant.primary
                    : AppButtonVariant.secondary,
                labelColor: ready ? Colors.white : AppColors.muted,
                onPressed: _handleJoin,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Uppercase input formatter (used implicitly via TextCapitalization; kept for
/// parity with the RN onChangeText uppercasing).
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
