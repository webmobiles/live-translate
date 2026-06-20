import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart';

import '../services/auth_service.dart';
import '../services/user_prefs.dart';
import '../theme.dart';

/// Languages the UI is translated into (mirrors mobile/src/lib/i18n.ts).
const List<String> kSupportedUiLangs = ['en', 'fr', 'es', 'pt', 'de', 'it'];

/// App-level state: current UI language, loaded translation bundles, and the
/// persisted user preferences. Replaces react-i18next + the prefs hook.
class AppState extends ChangeNotifier {
  final Map<String, Map<String, dynamic>> _bundles = {};
  String _lang = 'en';
  UserPrefs _prefs = const UserPrefs();
  Map<String, dynamic>? _usageBalance;

  String get lang => _lang;
  UserPrefs get prefs => _prefs;
  // Server-derived translation usage (realtime/voice/text). Ephemeral — not
  // persisted in UserPrefs; refreshed by syncProfileFromServer().
  Map<String, dynamic>? get usageBalance => _usageBalance;
  bool get isLightTheme => _prefs.themeMode == 'light';
  AppPalette get palette => isLightTheme ? kLightPalette : kDarkPalette;

  static String _deviceLang() {
    final code =
        ui.PlatformDispatcher.instance.locale.languageCode.toLowerCase();
    return kSupportedUiLangs.contains(code) ? code : 'en';
  }

  Future<void> init() async {
    for (final code in kSupportedUiLangs) {
      final raw = await rootBundle.loadString('assets/locales/$code.json');
      _bundles[code] = jsonDecode(raw) as Map<String, dynamic>;
    }
    _prefs = await UserPrefsStore.load();
    applyPalette(palette);
    _lang =
        _prefs.uiLang.isNotEmpty && kSupportedUiLangs.contains(_prefs.uiLang)
            ? _prefs.uiLang
            : _deviceLang();
    notifyListeners();
  }

  Future<void> setLanguage(String code) async {
    if (!kSupportedUiLangs.contains(code)) return;
    _lang = code;
    notifyListeners();
  }

  Future<void> updatePrefs(UserPrefs prefs) async {
    _prefs = await UserPrefsStore.save(prefs);
    applyPalette(palette);
    if (kSupportedUiLangs.contains(prefs.uiLang)) _lang = prefs.uiLang;
    notifyListeners();
  }

  /// Reload prefs from disk (used when returning to the home screen, like
  /// useFocusEffect(loadPrefs) in the RN app).
  Future<void> reloadPrefs() async {
    _prefs = await UserPrefsStore.load();
    applyPalette(palette);
    notifyListeners();
  }

  /// Pull the server profile into local prefs. For a signed-in user the DB is
  /// the source of truth for nickname / names / country / languages; device-only
  /// prefs (uiLang, theme, local avatar) are left untouched.
  Future<void> syncProfileFromServer() async {
    final me = await AuthService.fetchMe();
    if (me == null) return;
    _usageBalance = me['usage_balance'] as Map<String, dynamic>?;
    String keep(String? remote, String fallback) =>
        (remote != null && remote.isNotEmpty) ? remote : fallback;
    final merged = _prefs.copyWith(
      nickname: keep(me['nickname'] as String?, _prefs.nickname),
      firstName: keep(me['first_name'] as String?, _prefs.firstName),
      lastName: keep(me['last_name'] as String?, _prefs.lastName),
      country: keep(me['country'] as String?, _prefs.country),
      motherLang: keep(me['mother_language'] as String?, _prefs.motherLang),
      targetLang: keep(me['target_language'] as String?, _prefs.targetLang),
    );
    await updatePrefs(merged);
  }

  /// Translate a dot-path key, e.g. `t('create.errors.nickRequired')`.
  /// Supports `{{param}}` interpolation and an optional fallback string.
  String t(String key, {Map<String, String>? params, String? fallback}) {
    final value = _lookup(_bundles[_lang], key) ??
        _lookup(_bundles['en'], key) ??
        fallback ??
        key;
    if (params == null || params.isEmpty) return value;
    var out = value;
    params.forEach((k, v) => out = out.replaceAll('{{$k}}', v));
    return out;
  }

  static String? _lookup(Map<String, dynamic>? bundle, String key) {
    if (bundle == null) return null;
    dynamic node = bundle;
    for (final part in key.split('.')) {
      if (node is Map && node.containsKey(part)) {
        node = node[part];
      } else {
        return null;
      }
    }
    return node is String ? node : null;
  }
}

/// Convenience extension so screens can call `context.t('key')`.
extension AppStateContext on BuildContext {
  AppState get appState =>
      dependOnInheritedWidgetOfExactType<_AppStateScope>()!.notifier!;
}

/// Lightweight inherited scope (used by [AppStateProvider]).
class _AppStateScope extends InheritedNotifier<AppState> {
  const _AppStateScope(
      {required AppState super.notifier, required super.child});
}

class AppStateProvider extends StatelessWidget {
  final AppState state;
  final Widget child;
  const AppStateProvider({super.key, required this.state, required this.child});

  @override
  Widget build(BuildContext context) =>
      _AppStateScope(notifier: state, child: child);
}
