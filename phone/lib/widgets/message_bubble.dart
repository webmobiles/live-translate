import 'package:flutter/material.dart';

import '../models/language.dart';
import '../models/message.dart';
import '../theme.dart';

/// Port of mobile/src/components/MessageBubble.tsx (formatMessageTime + bubble).
String formatMessageTime(int timestamp) {
  final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
  final elapsedMs = DateTime.now().millisecondsSinceEpoch - timestamp;
  if (elapsedMs < 0) {
    return TimeOfDay.fromDateTime(date).format24();
  }
  final minutes = elapsedMs ~/ 60000;
  if (minutes < 1) return 'now';
  if (minutes < 60) return '$minutes min ago';
  final hours = elapsedMs ~/ 3600000;
  if (hours < 24) return '${hours}h ago';
  final days = elapsedMs ~/ 86400000;
  if (days < 7) return days == 1 ? '1 day ago' : '$days days ago';
  return '${date.day}/${date.month}/${date.year}';
}

extension on TimeOfDay {
  String format24() =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

class MessageBubble extends StatelessWidget {
  final Message message;
  const MessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isMine = message.isMine;
    final senderInfo = getLang(message.senderLang);
    final time = formatMessageTime(message.timestamp);

    if (message.isTranslating) {
      return Align(
        alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isMine ? AppColors.primary : AppColors.card,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(isMine ? 16 : 4),
              bottomRight: Radius.circular(isMine ? 4 : 16),
            ),
          ),
          child: SizedBox(
            height: 18,
            width: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: isMine ? Colors.white : AppColors.primary,
            ),
          ),
        ),
      );
    }

    final showOriginal = !isMine && message.translated != message.original;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment:
            isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!isMine)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(senderInfo.flag, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 6),
                  Text(
                    message.sender,
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isMine ? AppColors.primary : AppColors.card,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMine ? 16 : 4),
                  bottomRight: Radius.circular(isMine ? 4 : 16),
                ),
                border: isMine ? null : Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.isAudio)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        '🎤 Voice',
                        style: TextStyle(
                          fontSize: 12,
                          color: isMine ? Colors.white70 : AppColors.muted,
                        ),
                      ),
                    ),
                  Text(
                    message.translated,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      height: 1.4,
                    ),
                  ),
                  if (showOriginal)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        message.original,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Text(
              time,
              style: const TextStyle(color: AppColors.muted, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
