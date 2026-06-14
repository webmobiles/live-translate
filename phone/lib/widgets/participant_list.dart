import 'package:flutter/material.dart';

import '../models/language.dart';
import '../models/participant.dart';
import '../theme.dart';

/// Port of mobile/src/components/ParticipantList.tsx
class ParticipantList extends StatelessWidget {
  final List<Participant> participants;
  final String? mySocketId;

  const ParticipantList({
    super.key,
    required this.participants,
    this.mySocketId,
  });

  @override
  Widget build(BuildContext context) {
    if (participants.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            for (final p in participants) ...[
              _Pill(participant: p, isMe: p.socketId == mySocketId),
              const SizedBox(width: 8),
            ],
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final Participant participant;
  final bool isMe;
  const _Pill({required this.participant, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final lang = getLang(participant.language);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: isMe ? AppColors.primaryMuted : AppColors.card,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: isMe ? AppColors.primary : AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(lang.flag, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 6),
          Text(
            '${participant.nickname}${participant.isHost ? ' 👑' : ''}',
            style: TextStyle(
              color: isMe ? AppColors.primary : Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
