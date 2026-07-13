import 'package:flutter/material.dart';

class T {
  // ── Brand palette (from marjon-tokens.css) ──────────────────────────────
  static const bg           = Color(0xFF071428);   // neutral-950
  static const surface      = Color(0xFF0B1F3F);   // neutral-900
  static const surfaceLight = Color(0xFF0F2A50);   // neutral-800
  static const border       = Color(0xFF1A3A6B);   // slightly lighter

  static const accent       = Color(0xFF1DB5B5);   // teal-500
  static const accentLight  = Color(0xFF22D3EE);   // teal-400
  static const accentDark   = Color(0xFF0FA3A3);   // teal-600
  static const accentSubtle = Color(0x221DB5B5);   // teal-500 @13%

  static const blue         = Color(0xFF2563EB);   // blue-600
  static const blueLight    = Color(0xFF3B82F6);   // blue-500

  static const success      = Color(0xFF16A34A);   // green-600
  static const successLight = Color(0xFF86EFAC);   // green-300
  static const danger       = Color(0xFFEF4444);   // red-500
  static const warning      = Color(0xFFF59E0B);   // amber-500
  static const purple       = Color(0xFF7C3AED);   // purple-600

  static const text         = Color(0xFFF4F7FC);   // neutral-50
  static const muted        = Color(0xFF7A94B4);   // neutral-400
  static const mutedDark    = Color(0xFF536D8E);   // neutral-500

  // ── Theme ────────────────────────────────────────────────────────────────
  static final theme = ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.dark(
      primary: accent,
      surface: surface,
      error: danger,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: text),
      iconTheme: IconThemeData(color: text),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: border, width: 0.5),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: bg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: accent, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: const TextStyle(color: muted),
      hintStyle: const TextStyle(color: muted),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: accent,
      foregroundColor: Colors.white,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: surfaceLight,
      contentTextStyle: const TextStyle(color: text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: accent),
    dividerTheme: const DividerThemeData(color: border, space: 0),
    chipTheme: ChipThemeData(
      backgroundColor: surfaceLight,
      selectedColor: const Color(0x331DB5B5),
      labelStyle: const TextStyle(fontSize: 13, color: text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: const BorderSide(color: border, width: 0.5),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    tabBarTheme: const TabBarThemeData(
      indicatorColor: accent,
      labelColor: accent,
      unselectedLabelColor: muted,
      dividerColor: border,
    ),
  );
}
