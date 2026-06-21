import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';

/// Placeholder — the plan / upgrade page is intentionally blank for now.
class PlanScreen extends StatelessWidget {
  const PlanScreen({super.key});

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
                  Text(s.t('plan.title'),
                      style: TextStyle(
                          color: AppColors.text,
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 24),
              Text(s.t('plan.comingSoon'),
                  style: TextStyle(color: AppColors.muted, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }
}
