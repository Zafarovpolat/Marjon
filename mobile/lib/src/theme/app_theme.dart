import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildMarjonTheme() {
  const scheme = ColorScheme.light(
    primary: MC.teal500,
    onPrimary: Colors.white,
    secondary: MC.teal600,
    surface: MC.card,
    onSurface: MC.textPrimary,
    error: MC.danger,
    outline: MC.border,
  );

  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(MC.rMd),
        borderSide: BorderSide(color: c, width: w),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    fontFamily: MC.fontBody,
    scaffoldBackgroundColor: MC.bg,
    canvasColor: MC.card,
    dividerColor: MC.border,
    dividerTheme: const DividerThemeData(color: MC.border, thickness: 1, space: 1),
    splashFactory: InkRipple.splashFactory,
    textTheme: const TextTheme(
      bodyLarge: MT.body,
      bodyMedium: MT.body,
      bodySmall: MT.small,
      titleMedium: MT.title,
      titleLarge: MT.h2,
      labelLarge: MT.button,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: MC.card,
      surfaceTintColor: Colors.transparent,
      foregroundColor: MC.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: MT.title,
    ),
    cardTheme: CardThemeData(
      color: MC.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MC.rLg),
        side: const BorderSide(color: MC.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFEAEEF8),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: border(MC.border),
      enabledBorder: border(MC.border),
      focusedBorder: border(MC.teal500, 2),
      errorBorder: border(MC.danger),
      focusedErrorBorder: border(MC.danger, 2),
      hintStyle: const TextStyle(color: MC.textPlaceholder),
      labelStyle: MT.label,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: MC.teal500,
        foregroundColor: Colors.white,
        disabledBackgroundColor: MC.n200,
        disabledForegroundColor: MC.n400,
        elevation: 0,
        minimumSize: const Size.fromHeight(52),
        textStyle: MT.button,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rMd)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: MC.textPrimary,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: MC.border),
        textStyle: MT.button.copyWith(fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rMd)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: MC.teal600,
        textStyle: MT.button.copyWith(fontSize: 15),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: MC.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rXl)),
      titleTextStyle: MT.title,
      contentTextStyle: MT.body,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: MC.card,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(MC.rXl))),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: MC.n900,
      contentTextStyle: MT.body.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rMd)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: MC.n100,
      selectedColor: MC.teal500,
      side: BorderSide.none,
      labelStyle: MT.label,
      secondaryLabelStyle: MT.label.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : MC.n300),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? MC.teal500 : MC.n100),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: MC.teal500),
  );
}
