import 'package:flutter/material.dart';

import '../screens/join_screen.dart';
import '../screens/room_history_screen.dart';
import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'ui.dart';

/// Home "Recent rooms" card — last 3 rooms entered, with a "more…" link to the
/// full history. Renders nothing when the user has no rooms.
class RecentRoomsCard extends StatefulWidget {
  const RecentRoomsCard({super.key});

  @override
  State<RecentRoomsCard> createState() => _RecentRoomsCardState();
}

class _RecentRoomsCardState extends State<RecentRoomsCard> {
  List<dynamic> _rooms = [];
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await AuthService.fetchUserRooms(limit: 3);
    if (!mounted) return;
    setState(() {
      _rooms = (data?['rooms'] as List?) ?? [];
      _total = (data?['total'] as int?) ?? 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_rooms.isEmpty) return const SizedBox.shrink();
    final s = context.appState;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(s.t('home.recentRooms').toUpperCase(),
                  style: TextStyle(
                      color: AppColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 1)),
              if (_total > _rooms.length)
                GestureDetector(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => const RoomHistoryScreen())),
                  child: Text(s.t('home.moreRooms'),
                      style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          for (final room in _rooms) _tile(room),
        ],
      ),
    );
  }

  Widget _tile(dynamic room) {
    final code = (room['code'] as String?) ?? '';
    final name = room['name'] as String?;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => JoinScreen(initialCode: code)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                name != null && name.isNotEmpty ? name : code,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: AppColors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(width: 8),
            Text(code,
                style: TextStyle(
                    color: AppColors.muted,
                    fontSize: 12,
                    fontFamily: 'monospace')),
          ],
        ),
      ),
    );
  }
}
