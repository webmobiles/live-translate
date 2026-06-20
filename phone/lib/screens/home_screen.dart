import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:reactive_forms/reactive_forms.dart';

import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/ui.dart';
import '../widgets/usage_bars.dart';
import '../utils/validation.dart';
import 'create_screen.dart';
import 'forgot_password_screen.dart';
import 'join_screen.dart';
import 'settings_screen.dart';

const _uiLanguageNames = {
  'en': 'English',
  'fr': 'Français',
  'es': 'Español',
  'pt': 'Português',
  'de': 'Deutsch',
  'it': 'Italiano',
};

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final FormGroup _authForm;
  bool? _signedIn;
  bool _signingIn = false;
  bool _emailModeIsSignup = false;
  String? _authError;

  // Email-code verification (signup only)
  bool _codeSending = false;
  bool _codeVerifying = false;
  bool _codeVerified = false;
  int _resendCooldown = 0;
  Timer? _cooldownTimer;

  static const _resendCooldownSeconds = 60;

  String get _emailValue =>
      (_authForm.control('email').value as String? ?? '').trim();
  String get _passwordValue =>
      _authForm.control('password').value as String? ?? '';
  String get _nameValue => _authForm.control('name').value as String? ?? '';

  bool get _isValidEmail => _authForm.control('email').valid;
  bool get _canSubmitEmailForm =>
      !_signingIn &&
      _isValidEmail &&
      _passwordValue.isNotEmpty &&
      (!_emailModeIsSignup ||
          (_codeVerified && passwordErrorCode(_passwordValue) == null));

  void _resetCodeState() {
    _cooldownTimer?.cancel();
    _authForm.control('code').reset(value: '');
    _codeSending = false;
    _codeVerifying = false;
    _codeVerified = false;
    _resendCooldown = 0;
  }

  @override
  void initState() {
    super.initState();
    _authForm = FormGroup({
      'name': FormControl<String>(value: ''),
      'email': FormControl<String>(
        value: '',
        validators: [Validators.required, Validators.email],
      ),
      'code': FormControl<String>(
        value: '',
        validators: [Validators.minLength(6)],
      ),
      'password': FormControl<String>(
        value: '',
        validators: [Validators.required],
      ),
    });
    AuthService.isSignedIn().then((v) {
      if (mounted) setState(() => _signedIn = v);
      if (v) context.appState.syncProfileFromServer();
    });
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _authForm.dispose();
    super.dispose();
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _signingIn = true;
      _authError = null;
    });
    final result = await AuthService.signInWithGoogle();
    if (!mounted) return;
    setState(() {
      _signingIn = false;
      if (result.success) {
        _signedIn = true;
      } else if (result.error != null && result.error != 'oauth_failed') {
        _authError = result.error;
      } else if (result.error == 'oauth_failed') {
        _authError = 'oauth_failed';
      }
    });
    if (result.success) {
      await context.appState.syncProfileFromServer();
      if (!mounted) return;
      if (result.needsOnboarding) _openSettings(onboarding: true);
    }
  }

  Future<void> _signInWithEmail() async {
    _authForm.markAllAsTouched();
    if (!_canSubmitEmailForm) return;
    if (_emailModeIsSignup && !_codeVerified) {
      setState(() => _authError = 'email_not_verified');
      return;
    }
    setState(() {
      _signingIn = true;
      _authError = null;
    });

    final result = _emailModeIsSignup
        ? await AuthService.createAccountWithEmail(
            email: _emailValue,
            password: _passwordValue,
            name: _nameValue,
          )
        : await AuthService.signInWithEmail(
            email: _emailValue,
            password: _passwordValue,
          );

    if (!mounted) return;
    setState(() {
      _signingIn = false;
      if (result.success) {
        _signedIn = true;
      } else {
        _authError = result.error ?? 'oauth_failed';
      }
    });
    if (result.success) {
      await context.appState.syncProfileFromServer();
      if (!mounted) return;
      if (result.needsOnboarding) _openSettings(onboarding: true);
    }
  }

  Future<void> _sendCode() async {
    _authForm.control('email').markAsTouched();
    if (!_isValidEmail) {
      setState(() => _authError = 'email_invalid');
      return;
    }
    setState(() {
      _codeSending = true;
      _authError = null;
    });
    final result = await AuthService.sendEmailCode(_emailValue);
    if (!mounted) return;
    setState(() {
      _codeSending = false;
      if (result.success) {
        _startCooldown();
      } else {
        _authError = result.error ?? 'send_failed';
      }
    });
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _resendCooldown = _resendCooldownSeconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _resendCooldown -= 1;
        if (_resendCooldown <= 0) timer.cancel();
      });
    });
  }

  Future<void> _onCodeChanged(String value) async {
    setState(() {
      if (_codeVerified) _codeVerified = false;
    });
    if (value.length != 6 || _codeVerifying) return;
    setState(() {
      _codeVerifying = true;
      _authError = null;
    });
    final result = await AuthService.verifyEmailCode(
      email: _emailValue,
      code: value,
    );
    if (!mounted) return;
    setState(() {
      _codeVerifying = false;
      _codeVerified = result.success;
      if (!result.success) _authError = result.error ?? 'invalid_code';
    });
  }

  Future<void> _openSettings({bool onboarding = false}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(isOnboarding: onboarding),
      ),
    );
    if (mounted) context.appState.reloadPrefs();
  }

  Future<void> _changeUiLanguage(AppState s) async {
    final code = await showUiLanguagePicker(context, selected: s.lang);
    if (code != null && code != s.lang && mounted) {
      await context.appState.updatePrefs(s.prefs.copyWith(uiLang: code));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;

    if (_signedIn == null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('🌐', style: TextStyle(fontSize: 48)),
                SizedBox(height: 16),
                Text(s.t('common.loading'),
                    style: TextStyle(color: AppColors.muted, fontSize: 14)),
              ],
            ),
          ),
        ),
      );
    }

    return _signedIn! ? _buildHome(s) : _buildLogin(s);
  }

  // ── Login gate ────────────────────────────────────────────────────────────
  Widget _buildLogin(AppState s) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        alignment: Alignment.center,
                        child: Text('🌐', style: TextStyle(fontSize: 32)),
                      ),
                      SizedBox(height: 16),
                      Text('HelloVia Translate',
                          style: TextStyle(
                              color: AppColors.text,
                              fontSize: 30,
                              fontWeight: FontWeight.bold)),
                      SizedBox(height: 4),
                      Text(s.t('home.tagline'),
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(color: AppColors.muted, fontSize: 14)),
                      SizedBox(height: 16),
                      _appLanguageSelector(s),
                      SizedBox(height: 40),
                      AppCard(
                        padding: const EdgeInsets.all(32),
                        child: ReactiveForm(
                          formGroup: _authForm,
                          child: Column(
                            children: [
                              Text(s.t('login.title'),
                                  style: TextStyle(
                                      color: AppColors.text,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600)),
                              SizedBox(height: 4),
                              Text(s.t('login.subtitle'),
                                  style: TextStyle(
                                      color: AppColors.muted, fontSize: 14)),
                              SizedBox(height: 24),
                              if (_authError != null) ...[
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 12),
                                  decoration: BoxDecoration(
                                    color:
                                        const Color(0x1AFF4757), // danger @ 10%
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: AppColors.danger),
                                  ),
                                  child: Text(
                                    s.t('login.error.$_authError',
                                        fallback:
                                            s.t('login.error.oauth_failed')),
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                        color: AppColors.danger, fontSize: 14),
                                  ),
                                ),
                                SizedBox(height: 24),
                              ],
                              Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: AppColors.bg,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: _modeButton(
                                        s.t('login.emailSignIn'),
                                        !_emailModeIsSignup,
                                        () => setState(() {
                                          _emailModeIsSignup = false;
                                          _authError = null;
                                          _resetCodeState();
                                        }),
                                      ),
                                    ),
                                    Expanded(
                                      child: _modeButton(
                                        s.t('login.createAccount'),
                                        _emailModeIsSignup,
                                        () => setState(() {
                                          _emailModeIsSignup = true;
                                          _authError = null;
                                          _resetCodeState();
                                        }),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              SizedBox(height: 16),
                              if (_emailModeIsSignup) ...[
                                ReactiveAppInput(
                                  formControlName: 'name',
                                  hint: s.t('login.namePlaceholder'),
                                  textCapitalization: TextCapitalization.words,
                                ),
                                SizedBox(height: 12),
                              ],
                              ReactiveAppInput(
                                formControlName: 'email',
                                readOnly: _codeVerified,
                                hint: s.t('login.emailPlaceholder'),
                                keyboardType: TextInputType.emailAddress,
                                onChanged: (_) => setState(() {
                                  if (_emailModeIsSignup) _codeVerified = false;
                                }),
                                validationMessages: {
                                  ValidationMessage.required: (_) =>
                                      s.t('login.error.email_invalid'),
                                  ValidationMessage.email: (_) =>
                                      s.t('login.error.email_invalid'),
                                },
                              ),
                              SizedBox(height: 12),
                              if (_emailModeIsSignup) ...[
                                Row(
                                  children: [
                                    Expanded(
                                      child: ReactiveAppInput(
                                        formControlName: 'code',
                                        readOnly: _codeVerified,
                                        hint: s.t('signup.codePlaceholder'),
                                        keyboardType: TextInputType.number,
                                        maxLength: 6,
                                        inputFormatters: [
                                          FilteringTextInputFormatter
                                              .digitsOnly,
                                        ],
                                        onChanged: _onCodeChanged,
                                      ),
                                    ),
                                    if (!_codeVerified) ...[
                                      SizedBox(width: 8),
                                      AppButton(
                                        variant: AppButtonVariant.secondary,
                                        loading: _codeSending,
                                        disabled: !_isValidEmail ||
                                            _resendCooldown > 0,
                                        onPressed: _sendCode,
                                        label: _resendCooldown > 0
                                            ? s.t('signup.resendIn', params: {
                                                'seconds': '$_resendCooldown'
                                              })
                                            : s.t('signup.sendCode'),
                                        labelColor: AppColors.primary,
                                      ),
                                    ],
                                  ],
                                ),
                                if (_codeVerified)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      s.t('signup.verified'),
                                      style: const TextStyle(
                                        color: Color(0xFF22C55E),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                SizedBox(height: 12),
                              ],
                              ReactiveAppInput(
                                formControlName: 'password',
                                hint: s.t('login.passwordPlaceholder'),
                                obscureText: true,
                                onChanged: (_) => setState(() {}),
                                validationMessages: {
                                  ValidationMessage.required: (_) =>
                                      s.t('login.passwordPlaceholder'),
                                },
                              ),
                              if (_emailModeIsSignup &&
                                  _passwordValue.isNotEmpty &&
                                  passwordErrorCode(_passwordValue) !=
                                      null) ...[
                                const SizedBox(height: 6),
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    s.t('forgot.error.${passwordErrorCode(_passwordValue)}'),
                                    style: TextStyle(
                                        color: AppColors.danger, fontSize: 12),
                                  ),
                                ),
                              ],
                              if (!_emailModeIsSignup) ...[
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: GestureDetector(
                                    onTap: () => Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            const ForgotPasswordScreen(),
                                      ),
                                    ),
                                    child: Text(
                                      s.t('login.forgotPassword'),
                                      style: TextStyle(
                                          color: AppColors.primary,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500),
                                    ),
                                  ),
                                ),
                              ],
                              SizedBox(height: 16),
                              ReactiveFormConsumer(
                                builder: (context, form, child) => AppButton(
                                  loading: _signingIn,
                                  disabled: !_canSubmitEmailForm,
                                  onPressed: _signInWithEmail,
                                  child: Text(
                                    _emailModeIsSignup
                                        ? s.t('login.createAccount')
                                        : s.t('login.emailSignIn'),
                                    style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ),
                              SizedBox(height: 20),
                              Row(
                                children: [
                                  Expanded(
                                      child: Divider(color: AppColors.border)),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12),
                                    child: Text(s.t('login.or'),
                                        style: TextStyle(
                                            color: AppColors.muted,
                                            fontSize: 12)),
                                  ),
                                  Expanded(
                                      child: Divider(color: AppColors.border)),
                                ],
                              ),
                              SizedBox(height: 20),
                              AppButton(
                                variant: AppButtonVariant.secondary,
                                loading: _signingIn,
                                onPressed: _signInWithGoogle,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Container(
                                      width: 24,
                                      height: 24,
                                      decoration: BoxDecoration(
                                          color: AppColors.text,
                                          shape: BoxShape.circle),
                                      alignment: Alignment.center,
                                      child: Text('G',
                                          style: TextStyle(
                                              color: Color(0xFF374151),
                                              fontWeight: FontWeight.bold)),
                                    ),
                                    SizedBox(width: 12),
                                    Text(s.t('login.continueWithGoogle'),
                                        style: TextStyle(
                                            color: Color(0xFF1F2937),
                                            fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ),
                              SizedBox(height: 24),
                              Text(s.t('login.terms'),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      color: AppColors.muted,
                                      fontSize: 12,
                                      height: 1.5)),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(height: 40),
                      Text(s.t('login.noAccount'),
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(color: AppColors.muted, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _modeButton(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : AppColors.muted,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  // ── Signed-in home ─────────────────────────────────────────────────────────
  Widget _buildHome(AppState s) {
    final prefs = s.prefs;

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: MediaQuery.of(context).size.height -
                      MediaQuery.of(context).padding.vertical,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Logo
                      Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: AppColors.primaryMuted,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: AppColors.primary),
                        ),
                        alignment: Alignment.center,
                        child: Text('🌐', style: TextStyle(fontSize: 40)),
                      ),
                      SizedBox(height: 16),
                      Text('HelloVia Translate',
                          style: TextStyle(
                              color: AppColors.text,
                              fontSize: 36,
                              fontWeight: FontWeight.bold)),
                      SizedBox(height: 4),
                      Text(s.t('home.tagline'),
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(color: AppColors.muted, fontSize: 16)),
                      SizedBox(height: 32),

                      // User bar
                      AppCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Row(
                          children: [
                            _avatar(prefs.avatarUri),
                            SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                prefs.nickname.isNotEmpty
                                    ? prefs.nickname
                                    : s.t('settings.nicknamePlaceholder'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    color: AppColors.text,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (s.usageBalance != null) ...[
                        SizedBox(height: 16),
                        UsageBars(usage: s.usageBalance!),
                      ],
                      SizedBox(height: 32),

                      // Powered by
                      AppCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(s.t('home.poweredBy'),
                                style: TextStyle(
                                    color: AppColors.muted, fontSize: 14)),
                            SizedBox(width: 8),
                            Text('hellovia.app',
                                style: TextStyle(
                                    color: AppColors.accent,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14)),
                          ],
                        ),
                      ),
                      SizedBox(height: 32),

                      // Create / Join
                      AppButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const CreateScreen()),
                        ),
                        child: Column(
                          children: [
                            Text(s.t('home.createRoom'),
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold)),
                            SizedBox(height: 2),
                            Text(s.t('home.createRoomSub'),
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 14)),
                          ],
                        ),
                      ),
                      SizedBox(height: 16),
                      AppButton(
                        variant: AppButtonVariant.outline,
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const JoinScreen()),
                        ),
                        child: Column(
                          children: [
                            Text(s.t('home.joinRoom'),
                                style: TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold)),
                            SizedBox(height: 2),
                            Text(s.t('home.joinRoomSub'),
                                style: TextStyle(
                                    color: AppColors.muted, fontSize: 14)),
                          ],
                        ),
                      ),
                      SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 12,
              right: 24,
              child: AppButton(
                variant: AppButtonVariant.ghost,
                size: AppButtonSize.icon,
                onPressed: _openSettings,
                child: Text('⚙',
                    style: TextStyle(color: AppColors.muted, fontSize: 22)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar(String? uri) {
    if (uri != null && uri.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: Image.file(File(uri.replaceFirst('file://', '')),
            width: 32,
            height: 32,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                Text('👤', style: TextStyle(fontSize: 24))),
      );
    }
    return Text('👤', style: TextStyle(fontSize: 24));
  }

  Widget _appLanguageSelector(AppState s) {
    return Semantics(
      button: true,
      label: s.t('settings.uiLanguage'),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _changeUiLanguage(s),
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.card.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.language, size: 18, color: AppColors.muted),
                SizedBox(width: 7),
                Text(
                  _uiLanguageNames[s.lang] ?? 'English',
                  style: TextStyle(
                    color: AppColors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(width: 5),
                Icon(Icons.expand_more, size: 18, color: AppColors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
