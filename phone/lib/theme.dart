import 'package:flutter/material.dart';

/// A full color palette for one theme (light or dark).
class AppPalette {
  final Color bg;
  final Color surface;
  final Color card;
  final Color border;
  final Color primary;
  final Color primaryDark;
  final Color primaryMuted;
  final Color accent;
  final Color muted;
  final Color danger;
  final Color text;
  final Brightness brightness;

  const AppPalette({
    required this.bg,
    required this.surface,
    required this.card,
    required this.border,
    required this.primary,
    required this.primaryDark,
    required this.primaryMuted,
    required this.accent,
    required this.muted,
    required this.danger,
    required this.text,
    required this.brightness,
  });
}

const AppPalette kDarkPalette = AppPalette(
  bg: Color(0xFF0A0A0F),
  surface: Color(0xFF12121A),
  card: Color(0xFF1A1A28),
  border: Color(0xFF2A2A3E),
  primary: Color(0xFF7C6EFF),
  primaryDark: Color(0xFF5A52E0),
  primaryMuted: Color(0x267C6EFF),
  accent: Color(0xFF00D4B4),
  muted: Color(0xFF8A8AA3),
  danger: Color(0xFFFF4757),
  text: Color(0xFFFFFFFF),
  brightness: Brightness.dark,
);

const AppPalette kLightPalette = AppPalette(
  bg: Color(0xFFF7F7FB),
  surface: Color(0xFFFFFFFF),
  card: Color(0xFFFFFFFF),
  border: Color(0xFFE4E4ED),
  primary: Color(0xFF7C6EFF),
  primaryDark: Color(0xFF5A52E0),
  primaryMuted: Color(0x267C6EFF),
  accent: Color(0xFF0E9C82),
  muted: Color(0xFF6B6B7B),
  danger: Color(0xFFFF4757),
  text: Color(0xFF17171F),
  brightness: Brightness.light,
);

/// Current colors. NOT `const` — swapped at runtime by [applyPalette] so the
/// whole app can switch light/dark without migrating every call site. Widgets
/// that read these are non-const and rebuild when the theme changes.
class AppColors {
  static Color bg = kDarkPalette.bg;
  static Color surface = kDarkPalette.surface;
  static Color card = kDarkPalette.card;
  static Color border = kDarkPalette.border;
  static Color primary = kDarkPalette.primary;
  static Color primaryDark = kDarkPalette.primaryDark;
  static Color primaryMuted = kDarkPalette.primaryMuted;
  static Color accent = kDarkPalette.accent;
  static Color muted = kDarkPalette.muted;
  static Color danger = kDarkPalette.danger;
  // Primary text — white in dark mode, near-black in light mode.
  static Color text = kDarkPalette.text;
}

void applyPalette(AppPalette p) {
  AppColors.bg = p.bg;
  AppColors.surface = p.surface;
  AppColors.card = p.card;
  AppColors.border = p.border;
  AppColors.primary = p.primary;
  AppColors.primaryDark = p.primaryDark;
  AppColors.primaryMuted = p.primaryMuted;
  AppColors.accent = p.accent;
  AppColors.muted = p.muted;
  AppColors.danger = p.danger;
  AppColors.text = p.text;
}

ThemeData buildAppTheme(AppPalette p) {
  final base = ThemeData(brightness: p.brightness, useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: p.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: p.primary,
      secondary: p.accent,
      surface: p.card,
      error: p.danger,
      brightness: p.brightness,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: p.text,
      displayColor: p.text,
    ),
    splashColor: Colors.transparent,
    highlightColor: Colors.transparent,
  );
}
