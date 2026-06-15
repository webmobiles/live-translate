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
  final String? deliveryStatus;
  final double? progress;
  final String? progressStage;
  final Map<String, dynamic>? originalAudio;
  final Map<String, dynamic>? translatedAudio;

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
    this.deliveryStatus,
    this.progress,
    this.progressStage,
    this.originalAudio,
    this.translatedAudio,
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
        deliveryStatus: j['deliveryStatus'] as String?,
        progress: (j['progress'] as num?)?.toDouble(),
        progressStage: j['progressStage'] as String?,
        originalAudio: j['originalAudio'] is Map
            ? Map<String, dynamic>.from(j['originalAudio'] as Map)
            : null,
        translatedAudio: j['translatedAudio'] is Map
            ? Map<String, dynamic>.from(j['translatedAudio'] as Map)
            : null,
      );

  Message copyWith({
    String? original,
    String? translated,
    bool? isMine,
    bool? isTranslating,
    bool? failed,
    String? error,
    String? deliveryStatus,
    double? progress,
    String? progressStage,
    Map<String, dynamic>? originalAudio,
    Map<String, dynamic>? translatedAudio,
    bool clearProgress = false,
  }) =>
      Message(
        id: id,
        original: original ?? this.original,
        translated: translated ?? this.translated,
        sender: sender,
        senderLang: senderLang,
        targetLang: targetLang,
        isMine: isMine ?? this.isMine,
        isAudio: isAudio,
        timestamp: timestamp,
        isTranslating: isTranslating ?? this.isTranslating,
        failed: failed ?? this.failed,
        error: error ?? this.error,
        deliveryStatus: deliveryStatus ?? this.deliveryStatus,
        progress: clearProgress ? null : (progress ?? this.progress),
        progressStage: progressStage ?? this.progressStage,
        originalAudio: originalAudio ?? this.originalAudio,
        translatedAudio: translatedAudio ?? this.translatedAudio,
      );
}
