import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';
import 'ui.dart';

/// Claude-style usage bars for realtime / voice / text consumption.
///   credit (total) → faint gray track · used → blue · balance → light gray.
class UsageBars extends StatelessWidget {
  final Map<String, dynamic> usage;
  const UsageBars({super.key, required this.usage});

  static int _int(dynamic v) => v is num ? v.toInt() : 0;

  static String _group(int n) {
    final digits = n.abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
      buf.write(digits[i]);
    }
    return (n < 0 ? '-' : '') + buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    final realtime = (usage['realtime'] as Map?) ?? const {};
    final voice = (usage['voice'] as Map?) ?? const {};
    final text = (usage['text'] as Map?) ?? const {};
    final minUnit = s.t('usage.minutesShort');
    final wordsUnit = s.t('usage.words');
    String mins(int sec) => _group((sec / 60).round());

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.t('usage.title').toUpperCase(),
            style: TextStyle(
              color: AppColors.muted,
              fontSize: 12,
              fontWeight: FontWeight.w500,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 12),
          _bar(
            s.t('usage.realtime'),
            _int(realtime['usedSeconds']),
            _int(realtime['creditSeconds']),
            '${mins(_int(realtime['usedSeconds']))} / ${mins(_int(realtime['creditSeconds']))} $minUnit',
            false,
            s,
          ),
          _bar(
            s.t('usage.voice'),
            _int(voice['usedSeconds']),
            _int(voice['creditSeconds']),
            '${mins(_int(voice['usedSeconds']))} / ${mins(_int(voice['creditSeconds']))} $minUnit',
            true,
            s,
          ),
          _bar(
            s.t('usage.text'),
            _int(text['usedWords']),
            _int(text['creditWords']),
            '${_group(_int(text['usedWords']))} / ${_group(_int(text['creditWords']))} $wordsUnit',
            true,
            s,
          ),
        ],
      ),
    );
  }

  Widget _bar(String label, int used, int credit, String valueText, bool resets,
      AppState s) {
    final pct = credit > 0 ? (used / credit).clamp(0.0, 1.0) : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: TextStyle(
                      color: AppColors.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
              Text(valueText,
                  style: TextStyle(color: AppColors.muted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 8,
              child: Stack(
                children: [
                  // balance / track (light gray; faint when no credit)
                  Positioned.fill(
                    child: Container(
                      color: credit > 0
                          ? AppColors.border
                          : AppColors.border.withValues(alpha: 0.4),
                    ),
                  ),
                  // used (blue) overlay from the left
                  if (credit > 0)
                    FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: pct,
                      child: Container(color: AppColors.primary),
                    ),
                ],
              ),
            ),
          ),
          if (resets) ...[
            const SizedBox(height: 4),
            Text(s.t('usage.resetsMonthly'),
                style: TextStyle(color: AppColors.muted, fontSize: 10)),
          ],
        ],
      ),
    );
  }
}
