import 'package:flutter/material.dart';

/// Mirrors the NativeWind/Tailwind palette from the RN app (tailwind.config.js).
class AppColors {
  static const bg = Color(0xFF0A0A0F);
  static const surface = Color(0xFF12121A);
  static const card = Color(0xFF1A1A28);
  static const border = Color(0xFF2A2A3E);
  static const primary = Color(0xFF7C6EFF);
  static const primaryDark = Color(0xFF5A52E0);
  static const primaryMuted = Color(0x267C6EFF); // rgba(124,110,255,0.15)
  static const accent = Color(0xFF00D4B4);
  static const muted = Color(0xFF8A8AA3);
  static const danger = Color(0xFFFF4757);
  static const white = Color(0xFFFFFFFF);
}

ThemeData buildAppTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.primary,
      secondary: AppColors.accent,
      surface: AppColors.card,
      error: AppColors.danger,
      brightness: Brightness.dark,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.white,
      displayColor: AppColors.white,
    ),
    splashColor: Colors.transparent,
    highlightColor: Colors.transparent,
  );
}
