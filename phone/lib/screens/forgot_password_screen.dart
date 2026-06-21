import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'reset_password_screen.dart';

/// Forgot-password step 1 (DeepSeek-style): email + verification code. On
/// success, pushes [ResetPasswordScreen].
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _sending = false;
  bool _submitting = false;
  bool _codeSent = false;
  int _cooldown = 0;
  String? _error;
  Timer? _cooldownTimer;

  bool get _isValidEmail =>
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim());

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _cooldown = 60);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        _cooldown -= 1;
        if (_cooldown <= 0) t.cancel();
      });
    });
  }

  Future<void> _sendCode() async {
    if (!_isValidEmail) {
      setState(() => _error = 'email_invalid');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final r = await AuthService.forgotPassword(_email.text.trim());
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (r.success) {
        _codeSent = true;
        _startCooldown();
      } else {
        _error = r.error ?? 'send_failed';
      }
    });
  }

  Future<void> _continue() async {
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _error = 'invalid_code');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final r = await AuthService.verifyEmailCode(
        email: _email.text.trim(), code: code);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (r.success) {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ResetPasswordScreen(email: _email.text.trim()),
      ));
    } else {
      setState(() => _error = r.error ?? 'invalid_code');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    String tErr(String? c) => c == null
        ? ''
        : s.t('forgot.error.$c', fallback: s.t('forgot.error.auth_failed'));
    final canSend = _isValidEmail && _cooldown == 0 && !_sending;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              Text(s.t('forgot.title'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.text,
                      fontSize: 24,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(s.t('forgot.subtitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, fontSize: 14)),
              const SizedBox(height: 24),
              AppCard(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    if (_error != null) ...[
                      errorBanner(tErr(_error)),
                      const SizedBox(height: 12),
                    ],
                    AppInput(
                      hint: s.t('forgot.emailPlaceholder'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: AppInput(
                            hint: s.t('forgot.codePlaceholder'),
                            controller: _code,
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly
                            ],
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: 8),
                        AppButton(
                          variant: AppButtonVariant.secondary,
                          fullWidth: false,
                          loading: _sending,
                          disabled: !canSend,
                          onPressed: _sendCode,
                          label: _cooldown > 0
                              ? s.t('forgot.resendIn',
                                  params: {'seconds': '$_cooldown'})
                              : s.t('forgot.sendCode'),
                          labelColor: AppColors.primary,
                        ),
                      ],
                    ),
                    if (_codeSent) ...[
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(s.t('forgot.codeSent'),
                            style: TextStyle(
                                color: AppColors.muted, fontSize: 12)),
                      ),
                    ],
                    const SizedBox(height: 16),
                    AppButton(
                      loading: _submitting,
                      disabled: _code.text.trim().length != 6,
                      onPressed: _continue,
                      child: Text(s.t('forgot.continue'),
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: 12),
                    GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child: Text(s.t('forgot.backToLogin'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
