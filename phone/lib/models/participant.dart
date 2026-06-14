/// Port of shared Participant type.
class Participant {
  final String socketId;
  final String nickname;
  final String language;
  final bool isHost;
  final int joinedAt;

  const Participant({
    required this.socketId,
    required this.nickname,
    required this.language,
    required this.isHost,
    required this.joinedAt,
  });

  factory Participant.fromJson(Map<String, dynamic> j) => Participant(
        socketId: j['socketId'] as String? ?? '',
        nickname: j['nickname'] as String? ?? '',
        language: j['language'] as String? ?? 'en',
        isHost: j['isHost'] as bool? ?? false,
        joinedAt: (j['joinedAt'] as num?)?.toInt() ?? 0,
      );
}
