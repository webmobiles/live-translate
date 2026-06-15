import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Port of mobile/src/lib/userPrefs.ts
class UserPrefs {
  final String nickname;
  final String motherLang;
  final String targetLang;
  final String? avatarUri;
  final String uiLang;
  final String themeMode;

  const UserPrefs({
    this.nickname = '',
    this.motherLang = 'en',
    this.targetLang = 'fr',
    this.avatarUri,
    this.uiLang = 'en',
    this.themeMode = 'dark',
  });

  UserPrefs copyWith({
    String? nickname,
    String? motherLang,
    String? targetLang,
    String? avatarUri,
    bool clearAvatar = false,
    String? uiLang,
    String? themeMode,
  }) {
    return UserPrefs(
      nickname: nickname ?? this.nickname,
      motherLang: motherLang ?? this.motherLang,
      targetLang: targetLang ?? this.targetLang,
      avatarUri: clearAvatar ? null : (avatarUri ?? this.avatarUri),
      uiLang: uiLang ?? this.uiLang,
      themeMode: themeMode ?? this.themeMode,
    );
  }

  Map<String, dynamic> toJson() => {
        'nickname': nickname,
        'motherLang': motherLang,
        'targetLang': targetLang,
        'avatarUri': avatarUri,
        'uiLang': uiLang,
        'themeMode': themeMode,
      };

  factory UserPrefs.fromJson(Map<String, dynamic> j) => UserPrefs(
        nickname: j['nickname'] as String? ?? '',
        motherLang: j['motherLang'] as String? ?? 'en',
        targetLang: j['targetLang'] as String? ?? 'fr',
        avatarUri: j['avatarUri'] as String?,
        uiLang: j['uiLang'] as String? ?? 'en',
        themeMode: j['themeMode'] as String? ?? 'dark',
      );
}

class UserPrefsStore {
  static const _key = 'live_translate_user_prefs';

  static Future<UserPrefs> load() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_key);
      if (raw == null) return const UserPrefs();
      return UserPrefs.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const UserPrefs();
    }
  }

  static Future<UserPrefs> save(UserPrefs prefs) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_key, jsonEncode(prefs.toJson()));
    return prefs;
  }
}
