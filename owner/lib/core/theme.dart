import 'package:flutter/material.dart';

class T {
  static const bg = Color(0xFF071428);
  static const surface = Color(0xFF0B1F3F);
  static const surfaceLight = Color(0xFF0F2A50);
  static const border = Color(0xFF1A3A6B);
  static const accent = Color(0xFFFF6B35);
  static const accentLight = Color(0xFFFF8F5A);
  static const success = Color(0xFF16A34A);
  static const danger = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
  static const muted = Color(0xFF94A3B8);
  static const text = Color(0xFFF4F7FC);

  static final theme = ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.dark(primary: accent, surface: surface, error: danger),
    appBarTheme: const AppBarTheme(
      backgroundColor: surface, elevation: 0, centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: text),
      iconTheme: IconThemeData(color: text),
    ),
    cardTheme: CardThemeData(
      color: surface, elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: border, width: 0.5)),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: bg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: accent, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: const TextStyle(color: muted),
      hintStyle: const TextStyle(color: muted),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(
      backgroundColor: accent, foregroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
    )),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: accent, foregroundColor: Colors.white,
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
      selectedColor: Color(0x33FF6B35),
      labelStyle: const TextStyle(fontSize: 13, color: text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: const BorderSide(color: border, width: 0.5),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
  );
}
