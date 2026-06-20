import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../utils/validation.dart';
import '../widgets/ui.dart';

/// Forgot-password step 2: set a new password (gated server-side on the verified
/// code). On success, returns to the login screen.
class ResetPasswordScreen extends StatefulWidget {
  final String email;
  const ResetPasswordScreen({super.key, required this.email});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitting = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pwErr = passwordErrorCode(_password.text);
    if (pwErr != null) {
      setState(() => _error = pwErr);
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'passwords_mismatch');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final r = await AuthService.resetPassword(
        email: widget.email, password: _password.text);
    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (r.success) {
        _done = true;
      } else {
        _error = r.error ?? 'auth_failed';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    String tErr(String? c) => c == null
        ? ''
        : s.t('forgot.error.$c', fallback: s.t('forgot.error.auth_failed'));

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              Text(s.t('forgot.resetTitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.text,
                      fontSize: 24,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(s.t('forgot.resetSubtitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, fontSize: 14)),
              const SizedBox(height: 24),
              AppCard(
                padding: const EdgeInsets.all(24),
                child: _done
                    ? Column(
                        children: [
                          Text(s.t('forgot.success'),
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: AppColors.text, fontSize: 14)),
                          const SizedBox(height: 16),
                          AppButton(
                            onPressed: () => Navigator.of(context)
                                .popUntil((r) => r.isFirst),
                            child: Text(s.t('forgot.backToLogin'),
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ],
                      )
                    : Column(
                        children: [
                          if (_error != null) ...[
                            errorBanner(tErr(_error)),
                            const SizedBox(height: 12),
                          ],
                          AppInput(
                            hint: s.t('forgot.newPasswordPlaceholder'),
                            controller: _password,
                            obscureText: true,
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: 12),
                          AppInput(
                            hint: s.t('forgot.confirmPasswordPlaceholder'),
                            controller: _confirm,
                            obscureText: true,
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(s.t('forgot.passwordHint'),
                                style: TextStyle(
                                    color: AppColors.muted, fontSize: 12)),
                          ),
                          const SizedBox(height: 16),
                          AppButton(
                            loading: _submitting,
                            disabled:
                                _password.text.isEmpty || _confirm.text.isEmpty,
                            onPressed: _submit,
                            child: Text(s.t('forgot.resetButton'),
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(height: 12),
                          GestureDetector(
                            onTap: () => Navigator.of(context)
                                .popUntil((r) => r.isFirst),
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
