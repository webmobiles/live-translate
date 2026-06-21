import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'join_screen.dart';
import 'plan_screen.dart';

/// Full room history (plan-capped). Shows a "change plan" upsell when capped.
class RoomHistoryScreen extends StatefulWidget {
  const RoomHistoryScreen({super.key});

  @override
  State<RoomHistoryScreen> createState() => _RoomHistoryScreenState();
}

class _RoomHistoryScreenState extends State<RoomHistoryScreen> {
  List<dynamic>? _rooms;
  bool _capped = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await AuthService.fetchUserRooms();
    if (!mounted) return;
    setState(() {
      _rooms = (data?['rooms'] as List?) ?? [];
      _capped = data?['capped'] == true;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.appState;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: Icon(Icons.arrow_back, color: AppColors.text),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  Text(s.t('roomHistory.title'),
                      style: TextStyle(
                          color: AppColors.text,
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 16),
              if (_loading)
                Text(s.t('common.loading'),
                    style: TextStyle(color: AppColors.muted, fontSize: 14))
              else if (_rooms == null || _rooms!.isEmpty)
                Text(s.t('roomHistory.empty'),
                    style: TextStyle(color: AppColors.muted, fontSize: 14))
              else
                Expanded(
                  child: ListView(
                    children: [
                      for (final room in _rooms!) _roomTile(room),
                      if (_capped) ...[
                        const SizedBox(height: 8),
                        _changePlanButton(s),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _roomTile(dynamic room) {
    final code = (room['code'] as String?) ?? '';
    final name = room['name'] as String?;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => JoinScreen(initialCode: code)),
        ),
        child: AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
      ),
    );
  }

  Widget _changePlanButton(AppState s) {
    return GestureDetector(
      onTap: () => Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const PlanScreen())),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary),
        ),
        alignment: Alignment.center,
        child: Text(s.t('home.changePlan'),
            style: TextStyle(
                color: AppColors.primary,
                fontSize: 14,
                fontWeight: FontWeight.w600)),
      ),
    );
  }
}
