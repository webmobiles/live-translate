/// Port of shared RoomConfig type.
class RoomConfig {
  final String mode; // 'normal' | 'solo_multilang'
  final List<String>? soloLanguages;
  final String? guestDefaultLanguage;
  final bool inputText;
  final bool inputVoice;
  final String voicePipeline; // 'stt-text-translate' | 'direct-voice-translation'
  final bool outputTranslatedText;
  final bool outputTranslatedAudio;

  const RoomConfig({
    required this.mode,
    this.soloLanguages,
    this.guestDefaultLanguage,
    this.inputText = true,
    this.inputVoice = true,
    required this.voicePipeline,
    this.outputTranslatedText = true,
    this.outputTranslatedAudio = true,
  });

  Map<String, dynamic> toJson() => {
        'mode': mode,
        'soloLanguages': soloLanguages,
        'guestDefaultLanguage': guestDefaultLanguage,
        'input': {'text': inputText, 'voice': inputVoice},
        'voicePipeline': voicePipeline,
        'output': {
          'translatedText': outputTranslatedText,
          'translatedAudio': outputTranslatedAudio,
        },
      };
}
