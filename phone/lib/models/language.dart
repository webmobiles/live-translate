/// Port of shared/src/lib/languages.ts
class Language {
  final String code;
  final String name;
  final String nativeName;
  final String flag;

  const Language({
    required this.code,
    required this.name,
    required this.nativeName,
    required this.flag,
  });
}

const List<Language> kLanguages = [
  Language(code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸'),
  Language(code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸'),
  Language(code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷'),
  Language(code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪'),
  Language(code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹'),
  Language(code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷'),
  Language(code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳'),
  Language(code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵'),
  Language(code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷'),
  Language(code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦'),
  Language(code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺'),
  Language(code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳'),
  Language(code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷'),
  Language(code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱'),
  Language(code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱'),
  Language(code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪'),
  Language(code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿'),
  Language(code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮'),
  Language(code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺'),
  Language(code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴'),
  Language(code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦'),
];

Language getLang(String code) {
  return kLanguages.firstWhere(
    (l) => l.code == code,
    orElse: () => kLanguages.first,
  );
}
