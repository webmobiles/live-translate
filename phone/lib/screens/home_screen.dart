import 'dart:io';

import 'package:flutter/material.dart';

import '../config.dart';
import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/ui.dart';
import 'create_screen.dart';
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
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool? _signedIn;
  bool _signingIn = false;
  bool _emailModeIsSignup = false;
  String? _authError;

  @override
  void initState() {
    super.initState();
    if (!kRequireAuth) {
      _signedIn = true;
    } else {
      AuthService.isSignedIn().then((v) {
        if (mounted) setState(() => _signedIn = v);
        if (v) context.appState.syncProfileFromServer();
      });
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
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
    setState(() {
      _signingIn = true;
      _authError = null;
    });

    final result = _emailModeIsSignup
        ? await AuthService.createAccountWithEmail(
            email: _email.text.trim(),
            password: _password.text,
            name: _name.text,
          )
        : await AuthService.signInWithEmail(
            email: _email.text.trim(),
            password: _password.text,
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

  Future<void> _openSettings({bool onboarding = false}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(isOnboarding: onboarding),
      ),
    );
    if (mounted) context.appState.reloadPrefs();
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
        child: LayoutBuilder(
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
                      style: TextStyle(color: AppColors.muted, fontSize: 14)),
                  SizedBox(height: 40),
                  AppCard(
                    padding: const EdgeInsets.all(32),
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
                              color: const Color(0x1AFF4757), // danger @ 10%
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.danger),
                            ),
                            child: Text(
                              s.t('login.error.$_authError',
                                  fallback: s.t('login.error.oauth_failed')),
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
                                  }),
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: 16),
                        if (_emailModeIsSignup) ...[
                          AppInput(
                            hint: s.t('login.namePlaceholder'),
                            controller: _name,
                            textCapitalization: TextCapitalization.words,
                          ),
                          SizedBox(height: 12),
                        ],
                        AppInput(
                          hint: s.t('login.emailPlaceholder'),
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          onChanged: (_) => setState(() {}),
                        ),
                        SizedBox(height: 12),
                        AppInput(
                          hint: s.t('login.passwordPlaceholder'),
                          controller: _password,
                          obscureText: true,
                          onChanged: (_) => setState(() {}),
                        ),
                        SizedBox(height: 16),
                        AppButton(
                          loading: _signingIn,
                          disabled: _email.text.trim().isEmpty ||
                              _password.text.isEmpty,
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
                        SizedBox(height: 20),
                        Row(
                          children: [
                            Expanded(child: Divider(color: AppColors.border)),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              child: Text(s.t('login.or'),
                                  style: TextStyle(
                                      color: AppColors.muted, fontSize: 12)),
                            ),
                            Expanded(child: Divider(color: AppColors.border)),
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
                  SizedBox(height: 40),
                  Text(s.t('login.noAccount'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.muted, fontSize: 12)),
                ],
              ),
            ),
          ),
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
        child: SingleChildScrollView(
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
                      style: TextStyle(color: AppColors.muted, fontSize: 16)),
                  SizedBox(height: 32),

                  // App language — persisted locally (SharedPreferences via
                  // updatePrefs), independent of the room "mother language".
                  _appLanguageSelector(s),
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
                        AppButton(
                          variant: AppButtonVariant.ghost,
                          size: AppButtonSize.icon,
                          onPressed: _openSettings,
                          child: Text('⚙',
                              style: TextStyle(
                                  color: AppColors.muted, fontSize: 20)),
                        ),
                      ],
                    ),
                  ),
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
                      MaterialPageRoute(builder: (_) => const CreateScreen()),
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
                            style:
                                TextStyle(color: Colors.white70, fontSize: 14)),
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

  // App-language selector shown at the top of the home screen. Picking a
  // language persists it to local prefs (SharedPreferences) and applies it
  // immediately via updatePrefs — no account or server round-trip needed.
  Widget _appLanguageSelector(AppState s) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          s.t('settings.uiLanguage').toUpperCase(),
          style: TextStyle(
            color: AppColors.muted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 6),
        GestureDetector(
          onTap: () async {
            final code = await showUiLanguagePicker(context, selected: s.lang);
            if (code != null && code != s.lang) {
              await context.appState.updatePrefs(s.prefs.copyWith(uiLang: code));
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_uiLanguageNames[s.lang] ?? 'English',
                    style: TextStyle(
                        color: AppColors.text, fontWeight: FontWeight.w500)),
                Text(s.t('common.change'),
                    style: TextStyle(color: AppColors.muted, fontSize: 14)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
