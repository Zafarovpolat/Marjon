import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class T {
  // ── Brand palette ─────────────────────────────────────────────────────────
  static const bg           = Color(0xFFF4F7FC);   // page background — light grey
  static const surface      = Color(0xFFFFFFFF);   // card / surface — white
  static const surfaceLight = Color(0xFFF0F4FA);   // secondary surface
  static const border       = Color(0xFFE2EBF8);   // subtle border

  static const accent       = Color(0xFF1DB5B5);   // teal-500
  static const accentLight  = Color(0xFF22D3EE);   // teal-400
  static const accentDark   = Color(0xFF0FA3A3);   // teal-600
  static const accentSubtle = Color(0x1A1DB5B5);   // teal @10%

  static const blue         = Color(0xFF2563EB);
  static const blueLight    = Color(0xFF3B82F6);

  static const success      = Color(0xFF16A34A);
  static const successLight = Color(0xFF86EFAC);
  static const danger       = Color(0xFFEF4444);
  static const warning      = Color(0xFFF59E0B);
  static const purple       = Color(0xFF7C3AED);
  static const orange       = Color(0xFFFB923C);

  // Text
  static const text         = Color(0xFF071428);   // primary — dark navy
  static const muted        = Color(0xFF7A94B4);   // secondary
  static const mutedDark    = Color(0xFF536D8E);

  // Bottom nav stays dark even in light app
  static const navBg        = Color(0xFF071428);
  static const navSelected  = Color(0xFF1DB5B5);
  static const navUnselected = Color(0xFF7A94B4);

  // ── Card shadow ───────────────────────────────────────────────────────────
  static List<BoxShadow> get cardShadow => [
    const BoxShadow(color: Color(0x0D071428), blurRadius: 16, offset: Offset(0, 4)),
    const BoxShadow(color: Color(0x06071428), blurRadius: 4, offset: Offset(0, 1)),
  ];

  static List<BoxShadow> get softShadow => [
    const BoxShadow(color: Color(0x08071428), blurRadius: 12, offset: Offset(0, 3)),
  ];

  // ── Theme ─────────────────────────────────────────────────────────────────
  static final theme = ThemeData(
    brightness: Brightness.light,
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.light(
      primary: accent,
      surface: surface,
      error: danger,
      onPrimary: Colors.white,
      onSurface: text,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
      ),
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text),
      iconTheme: IconThemeData(color: text),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: bg,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: accent, width: 2),
      ),
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
        elevation: 0,
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: accent,
      foregroundColor: Colors.white,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: const Color(0xFF0B1F3F),
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: accent),
    dividerTheme: const DividerThemeData(color: border, space: 0),
    chipTheme: ChipThemeData(
      backgroundColor: surfaceLight,
      selectedColor: accentSubtle,
      labelStyle: const TextStyle(fontSize: 13, color: text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: const BorderSide(color: border),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? accent : Colors.white,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected)
            ? accent.withValues(alpha: 0.4) : border,
      ),
    ),
    tabBarTheme: const TabBarThemeData(
      indicatorColor: accent,
      labelColor: accent,
      unselectedLabelColor: muted,
      dividerColor: border,
    ),
    popupMenuTheme: const PopupMenuThemeData(
      color: surface,
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
    ),
    listTileTheme: const ListTileThemeData(
      textColor: text,
      iconColor: muted,
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: text),
      bodySmall: TextStyle(color: muted),
    ),
  );
}
