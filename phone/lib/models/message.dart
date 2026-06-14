/// Port of shared Message type.
class Message {
  final String id;
  final String original;
  final String translated;
  final String sender;
  final String senderLang;
  final String targetLang;
  final bool isMine;
  final bool isAudio;
  final int timestamp;
  final bool isTranslating;
  final bool failed;
  final String? error;

  const Message({
    required this.id,
    required this.original,
    required this.translated,
    required this.sender,
    required this.senderLang,
    required this.targetLang,
    required this.isMine,
    this.isAudio = false,
    required this.timestamp,
    this.isTranslating = false,
    this.failed = false,
    this.error,
  });

  bool get isSystem => sender == 'system';

  factory Message.fromJson(Map<String, dynamic> j) => Message(
        id: j['id'] as String? ?? '',
        original: j['original'] as String? ?? '',
        translated: j['translated'] as String? ?? '',
        sender: j['sender'] as String? ?? '',
        senderLang: j['senderLang'] as String? ?? 'en',
        targetLang: j['targetLang'] as String? ?? 'en',
        isMine: j['isMine'] as bool? ?? false,
        isAudio: j['isAudio'] as bool? ?? false,
        timestamp: (j['timestamp'] as num?)?.toInt() ??
            DateTime.now().millisecondsSinceEpoch,
        isTranslating: j['isTranslating'] as bool? ?? false,
      );

  Message copyWith({bool? isTranslating, bool? failed, String? error}) =>
      Message(
        id: id,
        original: original,
        translated: translated,
        sender: sender,
        senderLang: senderLang,
        targetLang: targetLang,
        isMine: isMine,
        isAudio: isAudio,
        timestamp: timestamp,
        isTranslating: isTranslating ?? this.isTranslating,
        failed: failed ?? this.failed,
        error: error ?? this.error,
      );
}
