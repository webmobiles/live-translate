import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/language.dart';
import '../services/auth_service.dart';
import '../services/user_prefs.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/language_selector.dart';
import '../widgets/ui.dart';
import 'home_screen.dart';

class SettingsScreen extends StatefulWidget {
  /// In onboarding mode the screen only collects nickname + languages (a new
  /// user shouldn't be forced to fill first/last/country just to try the app).
  final bool isOnboarding;
  const SettingsScreen({super.key, this.isOnboarding = false});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nickname = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  String _country = '';
  String _motherLang = 'en';
  String _targetLang = 'fr';
  String? _avatarUri;
  String _themeMode = 'dark';
  bool _saving = false;
  bool _saved = false;
  bool _initialised = false;

  bool get _isOnboarding => widget.isOnboarding;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final p = context.appState.prefs;
    _nickname.text = p.nickname;
    _firstName.text = p.firstName;
    _lastName.text = p.lastName;
    _country = p.country;
    _motherLang = p.motherLang;
    _targetLang = p.targetLang;
    _avatarUri = p.avatarUri;
    _themeMode = p.themeMode == 'light' ? 'light' : 'dark';
  }

  @override
  void dispose() {
    _nickname.dispose();
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1024,
      maxHeight: 1024,
    );
    if (file == null) return;
    setState(() => _avatarUri = file.path);
    await context.appState.updatePrefs(
      context.appState.prefs.copyWith(avatarUri: file.path),
    );
  }

  // Outside onboarding, every field is required to save.
  bool get _canSave =>
      _nickname.text.trim().isNotEmpty &&
      (_isOnboarding ||
          (_firstName.text.trim().isNotEmpty &&
              _lastName.text.trim().isNotEmpty &&
              _country.isNotEmpty));

  Future<void> _handleSave() async {
    final s = context.appState;
    if (!_canSave) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(s.t('create.errors.nickRequired'))),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      // Push to the server when signed in (token present); first/last/country
      // are omitted during onboarding so a partial save never wipes them.
      final token = await AuthService.getToken();
      if (token != null) {
        await AuthService.saveProfile(
          nickname: _nickname.text.trim(),
          firstName: _isOnboarding ? null : _firstName.text.trim(),
          lastName: _isOnboarding ? null : _lastName.text.trim(),
          country: _isOnboarding ? null : _country,
          motherLanguage: _motherLang,
          targetLanguage: _targetLang,
        );
      }
      await s.updatePrefs(UserPrefs(
        nickname: _nickname.text.trim(),
        firstName: _firstName.text.trim(),
        lastName: _lastName.text.trim(),
        country: _country,
        motherLang: _motherLang,
        targetLang: _targetLang,
        avatarUri: _avatarUri,
        uiLang: s.prefs.uiLang,
        themeMode: _themeMode,
      ));
      if (!mounted) return;
      setState(() => _saved = true);
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _saved = false);
      });
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(s.t('common.error.generic',
              fallback: 'Could not save. Please try again.'))),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _handleLogout() async {
    final s = context.appState;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: Text(
          s.t('settings.signOutConfirm'),
          style: TextStyle(color: AppColors.text, fontSize: 15),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(s.t('common.cancel'),
                style: TextStyle(color: AppColors.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(s.t('common.signOut'),
                style: TextStyle(
                    color: AppColors.danger, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await AuthService.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    final motherInfo = getLang(_motherLang);
    final targetInfo = getLang(_targetLang);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
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
                  Text(s.t('settings.title'),
                      style: TextStyle(
                          color: AppColors.text,
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              SizedBox(height: 28),

              // Avatar
              Center(
                child: Column(
                  children: [
                    GestureDetector(
                      onTap: _pickAvatar,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            width: 96,
                            height: 96,
                            decoration: BoxDecoration(
                              color: AppColors.card,
                              shape: BoxShape.circle,
                              border:
                                  Border.all(color: AppColors.border, width: 2),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: _avatarUri != null && _avatarUri!.isNotEmpty
                                ? Image.file(
                                    File(_avatarUri!
                                        .replaceFirst('file://', '')),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Center(
                                        child: Text('👤',
                                            style: TextStyle(fontSize: 40))),
                                  )
                                : Center(
                                    child: Text('👤',
                                        style: TextStyle(fontSize: 40))),
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                  color: AppColors.primary,
                                  shape: BoxShape.circle),
                              alignment: Alignment.center,
                              child: Text('✎',
                                  style: TextStyle(
                                      color: Colors.white, fontSize: 12)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: 12),
                    Text(s.t('settings.avatarHint'),
                        style: TextStyle(color: AppColors.muted, fontSize: 12)),
                  ],
                ),
              ),
              SizedBox(height: 28),

              // Nickname
              AppInput(
                label: s.t('settings.nickname'),
                hint: s.t('settings.nicknamePlaceholder'),
                controller: _nickname,
                maxLength: 100,
                onChanged: (_) => setState(() {}),
              ),
              SizedBox(height: 28),

              // First name / Last name / Country — not asked during onboarding.
              if (!_isOnboarding) ...[
                AppInput(
                  label: s.t('settings.firstName'),
                  hint: s.t('settings.firstNamePlaceholder'),
                  controller: _firstName,
                  maxLength: 100,
                  onChanged: (_) => setState(() {}),
                ),
                SizedBox(height: 28),
                AppInput(
                  label: s.t('settings.lastName'),
                  hint: s.t('settings.lastNamePlaceholder'),
                  controller: _lastName,
                  maxLength: 100,
                  onChanged: (_) => setState(() {}),
                ),
                SizedBox(height: 28),
                _sectionLabel(s.t('settings.country')),
                SizedBox(height: 6),
                GestureDetector(
                  onTap: () async {
                    final code =
                        await showCountryPicker(context, selected: _country);
                    if (code != null) setState(() => _country = code);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 16),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _country.isEmpty
                              ? s.t('settings.countryPlaceholder')
                              : s.t('countries.$_country'),
                          style: TextStyle(
                            color: _country.isEmpty
                                ? AppColors.muted
                                : AppColors.text,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(s.t('common.change'),
                            style: TextStyle(
                                color: AppColors.muted, fontSize: 14)),
                      ],
                    ),
                  ),
                ),
                SizedBox(height: 28),
              ],

              // Native language
              _langCard(
                label: s.t('settings.motherLang'),
                info: motherInfo,
                changeLabel: s.t('common.change'),
                onTap: () async {
                  final code =
                      await showLanguagePicker(context, selected: _motherLang);
                  if (code != null) setState(() => _motherLang = code);
                },
              ),
              SizedBox(height: 28),

              // Target language
              _langCard(
                label: s.t('settings.targetLang'),
                info: targetInfo,
                changeLabel: s.t('common.change'),
                onTap: () async {
                  final code =
                      await showLanguagePicker(context, selected: _targetLang);
                  if (code != null) setState(() => _targetLang = code);
                },
              ),
              SizedBox(height: 28),

              // Theme
              _sectionLabel(s.t('settings.theme', fallback: 'Theme')),
              SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _themeMode == 'light'
                            ? s.t('settings.lightMode', fallback: 'Light mode')
                            : s.t('settings.darkMode', fallback: 'Dark mode'),
                        style: TextStyle(
                          color: AppColors.text,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Switch(
                      value: _themeMode == 'light',
                      activeThumbColor: AppColors.accent,
                      onChanged: (value) async {
                        final next = value ? 'light' : 'dark';
                        setState(() => _themeMode = next);
                        await context.appState.updatePrefs(
                          context.appState.prefs.copyWith(themeMode: next),
                        );
                      },
                    ),
                  ],
                ),
              ),
              SizedBox(height: 28),

              // Save
              AppButton(
                size: AppButtonSize.large,
                disabled: _saving || !_canSave,
                onPressed: _handleSave,
                child: Text(
                  _saving
                      ? s.t('common.saving')
                      : _saved
                          ? s.t('settings.saved')
                          : s.t('settings.save'),
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold),
                ),
              ),

              SizedBox(height: 16),

              // Log out
              AppButton(
                variant: AppButtonVariant.secondary,
                onPressed: _handleLogout,
                child: Text(
                  s.t('common.signOut'),
                  style: TextStyle(
                      color: AppColors.danger,
                      fontSize: 16,
                      fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text.toUpperCase(),
        style: TextStyle(
            color: AppColors.muted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: 1),
      );

  Widget _langCard({
    required String label,
    required Language info,
    required String changeLabel,
    required VoidCallback onTap,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(label),
        SizedBox(height: 6),
        GestureDetector(
          onTap: onTap,
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
                Row(
                  children: [
                    Text(info.flag, style: TextStyle(fontSize: 28)),
                    SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(info.name,
                            style: TextStyle(
                                color: AppColors.text,
                                fontWeight: FontWeight.w500)),
                        Text(info.code.toUpperCase(),
                            style: TextStyle(
                                color: AppColors.muted, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
                Text(changeLabel,
                    style: TextStyle(color: AppColors.muted, fontSize: 14)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
