import 'package:flutter/material.dart';

import '../models/language.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// Bottom-sheet language picker. Returns the chosen code, or null if dismissed.
/// Replaces the <LanguageSelector> modal from the RN app.
Future<String?> showLanguagePicker(
  BuildContext context, {
  required String selected,
}) {
  final title = context.appState.t('common.uiLanguage', fallback: 'Select Language');
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: AppColors.card,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => _LanguageSheet(
      title: title,
      selected: selected,
      items: kLanguages
          .map((l) => _SheetItem(l.code, l.name, l.nativeName, l.flag))
          .toList(),
    ),
  );
}

/// UI-language variant (the 6 translated languages), mirrors UiLanguagePicker.
Future<String?> showUiLanguagePicker(
  BuildContext context, {
  required String selected,
}) {
  const names = {
    'en': 'English',
    'fr': 'Français',
    'es': 'Español',
    'pt': 'Português',
    'de': 'Deutsch',
    'it': 'Italiano',
  };
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: AppColors.card,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => _LanguageSheet(
      title: ctx.appState.t('settings.uiLanguage'),
      selected: selected,
      items: kSupportedUiLangs
          .map((c) => _SheetItem(c, names[c] ?? c, null, null))
          .toList(),
    ),
  );
}

class _SheetItem {
  final String code;
  final String name;
  final String? sub;
  final String? flag;
  _SheetItem(this.code, this.name, this.sub, this.flag);
}

class _LanguageSheet extends StatelessWidget {
  final String title;
  final String selected;
  final List<_SheetItem> items;

  const _LanguageSheet({
    required this.title,
    required this.selected,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return SafeAreaWidgetBottom(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: TextStyle(
              color: AppColors.text,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: items.length,
              itemBuilder: (ctx, i) {
                final item = items[i];
                final isSel = item.code == selected;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Material(
                    color: isSel ? AppColors.primaryMuted : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => Navigator.of(ctx).pop(item.code),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: isSel
                              ? Border.all(color: AppColors.primary)
                              : null,
                        ),
                        child: Row(
                          children: [
                            if (item.flag != null) ...[
                              Text(item.flag!,
                                  style: TextStyle(fontSize: 24)),
                              const SizedBox(width: 12),
                            ],
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.name,
                                    style: TextStyle(
                                      color: isSel
                                          ? AppColors.primary
                                          : AppColors.text,
                                      fontWeight: FontWeight.w500,
                                      fontSize: 16,
                                    ),
                                  ),
                                  if (item.sub != null)
                                    Text(item.sub!,
                                        style: TextStyle(
                                            color: AppColors.muted,
                                            fontSize: 14)),
                                ],
                              ),
                            ),
                            if (isSel)
                              const Text('✓',
                                  style: TextStyle(
                                      color: AppColors.primary, fontSize: 18)),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

/// SafeArea that only pads the bottom (so the sheet clears the home indicator).
class SafeAreaWidgetBottom extends StatelessWidget {
  final Widget child;
  const SafeAreaWidgetBottom({super.key, required this.child});
  @override
  Widget build(BuildContext context) =>
      SafeArea(top: false, child: child);
}

/// Port of <LanguageBadge> — a tappable pill showing flag + language name.
class LanguageBadge extends StatelessWidget {
  final String code;
  final VoidCallback? onTap;

  const LanguageBadge({super.key, required this.code, this.onTap});

  @override
  Widget build(BuildContext context) {
    final lang = getLang(code);
    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.primaryMuted,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.primary),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(lang.flag, style: TextStyle(fontSize: 16)),
          const SizedBox(width: 6),
          Text(
            lang.name,
            style: TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 2),
            const Text('▾',
                style: TextStyle(color: AppColors.primary, fontSize: 12)),
          ],
        ],
      ),
    );
    return onTap == null ? pill : GestureDetector(onTap: onTap, child: pill);
  }
}
