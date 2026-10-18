import 'package:flutter/material.dart';

/// Marjon design tokens (light theme) — mirror of desktop/src/styles/tokens.css,
/// which itself mirrors frontend/src/styles/global/marjon-tokens.css.
class MC {
  MC._();

  // Teal — brand
  static const teal50 = Color(0xFFECFEFF);
  static const teal100 = Color(0xFFCFFAFE);
  static const teal400 = Color(0xFF22D3EE);
  static const teal500 = Color(0xFF1DB5B5);
  static const teal600 = Color(0xFF0FA3A3);
  static const teal700 = Color(0xFF0E8080);

  // Blue — links only
  static const blue500 = Color(0xFF3B82F6);
  static const blue600 = Color(0xFF2563EB);

  // Neutral: white -> navy
  static const n0 = Color(0xFFFFFFFF);
  static const n50 = Color(0xFFF4F7FC);
  static const n100 = Color(0xFFE8EDF6);
  static const n200 = Color(0xFFD0D9E8);
  static const n300 = Color(0xFFA8B9D0);
  static const n400 = Color(0xFF7A94B4);
  static const n500 = Color(0xFF536D8E);
  static const n600 = Color(0xFF374F6E);
  static const n700 = Color(0xFF243A56);
  static const n800 = Color(0xFF162840);
  static const n900 = Color(0xFF0B1F3F);
  static const n950 = Color(0xFF071428);

  // Semantic
  static const green100 = Color(0xFFDCFCE7);
  static const green500 = Color(0xFF16A34A);
  static const green600 = Color(0xFF15803D);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber500 = Color(0xFFF59E0B);
  static const amber700 = Color(0xFFB45309);
  static const red100 = Color(0xFFFEE2E2);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const purple500 = Color(0xFF7C3AED);

  // Aliases
  static const brand = teal500;
  static const brandDark = teal600;
  static const brandSubtle = teal50;
  static const brandBg = Color(0x1F1DB5B5); // teal 12%
  static const bg = n50;
  static const card = n0;
  static const border = n200;
  static const borderLight = n100;
  static const textPrimary = n900;
  static const textSecondary = n600;
  static const textMuted = n500;
  static const textPlaceholder = n400;
  static const success = green500;
  static const warning = amber500;
  static const danger = red500;
  static const overlay = Color(0x8C071428); // navy 55%

  // Radii
  static const rSm = 8.0;
  static const rMd = 12.0;
  static const rLg = 16.0;
  static const rXl = 20.0;

  static const fontDisplay = 'Manrope';
  static const fontBody = 'GolosText';
  static const fontMono = 'JetBrainsMono';
}

/// Text styles. Weight ladder as on desktop: 400 body, 500 numeric accents,
/// 600 interface, 700 headings/totals (never above 700 except brand 800).
class MT {
  MT._();

  static const _body = MC.fontBody;
  static const _display = MC.fontDisplay;

  static const body = TextStyle(fontFamily: _body, fontSize: 15, height: 1.35, color: MC.textPrimary);
  static const bodyMuted = TextStyle(fontFamily: _body, fontSize: 14, height: 1.35, color: MC.textMuted);
  static const small = TextStyle(fontFamily: _body, fontSize: 12, height: 1.3, color: MC.textMuted);
  static const label = TextStyle(fontFamily: _body, fontSize: 13, fontWeight: FontWeight.w600, color: MC.textSecondary);
  static const button = TextStyle(fontFamily: _display, fontSize: 16, fontWeight: FontWeight.w700);
  static const title = TextStyle(fontFamily: _display, fontSize: 20, fontWeight: FontWeight.w700, color: MC.textPrimary);
  static const h1 = TextStyle(fontFamily: _display, fontSize: 26, fontWeight: FontWeight.w700, color: MC.textPrimary);
  static const h2 = TextStyle(fontFamily: _display, fontSize: 22, fontWeight: FontWeight.w700, color: MC.textPrimary);
  static const brand = TextStyle(fontFamily: _display, fontSize: 30, fontWeight: FontWeight.w800, color: MC.teal500, letterSpacing: 0.5);
  static const money = TextStyle(fontFamily: _display, fontSize: 16, fontWeight: FontWeight.w700, color: MC.teal600);
  static const mono = TextStyle(fontFamily: MC.fontMono, fontSize: 14, fontWeight: FontWeight.w500, color: MC.textPrimary);
  static const clock = TextStyle(fontFamily: MC.fontMono, fontSize: 56, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 2);
}
