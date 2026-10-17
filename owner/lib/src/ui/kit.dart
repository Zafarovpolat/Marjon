import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'labels.dart';
import '../theme/tokens.dart';

// ── formatting ───────────────────────────────────────────────────────────

final _money = NumberFormat.decimalPattern('ru');

/// 78400 -> "78 400"
String fmtNum(num? v) => _money.format((v ?? 0).round()).replaceAll(' ', ' ');

/// 78400 -> "78 400 сум"
String fmtMoney(num? v) => '${fmtNum(v)} ${t('currency')}';

num toNum(dynamic v) => v is num ? v : (num.tryParse('${v ?? 0}') ?? 0);

// Uzbekistan phone helpers (+998 XX XXX-XX-XX)
String extractPhoneDigits(String raw) {
  var d = raw.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('998')) d = d.substring(3);
  return d.length > 9 ? d.substring(0, 9) : d;
}

String formatPhone(String digits) {
  final d = extractPhoneDigits(digits);
  var out = '+998';
  if (d.isNotEmpty) out += ' ${d.substring(0, d.length.clamp(0, 2))}';
  if (d.length > 2) out += ' ${d.substring(2, d.length.clamp(2, 5))}';
  if (d.length > 5) out += '-${d.substring(5, d.length.clamp(5, 7))}';
  if (d.length > 7) out += '-${d.substring(7, d.length.clamp(7, 9))}';
  return out;
}

String fullPhone(String digits) {
  final d = extractPhoneDigits(digits);
  return d.isEmpty ? '' : '+998$d';
}

bool isPhoneComplete(String digits) => extractPhoneDigits(digits).length == 9;

class PhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = formatPhone(newValue.text);
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

String initials(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2);
  final s = parts.map((w) => w[0].toUpperCase()).join();
  return s.isEmpty ? '?' : s;
}

const _avatarColors = [
  Color(0xFF1DB5B5), Color(0xFF2563EB), Color(0xFF7C3AED), Color(0xFFF59E0B),
  Color(0xFF16A34A), Color(0xFFEF4444), Color(0xFF0E8080), Color(0xFFE11D48),
];

Color avatarColor(String? name) {
  var h = 0;
  for (final c in (name ?? '').codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return _avatarColors[h % _avatarColors.length];
}

// ── feedback ─────────────────────────────────────────────────────────────

void toast(BuildContext context, String msg, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(msg, style: MT.body.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
    backgroundColor: error ? MC.red600 : MC.n900,
    duration: const Duration(seconds: 3),
  ));
}

// ── surfaces ─────────────────────────────────────────────────────────────

/// Restaurant photo behind a navy scrim — auth / organization screens.
class MarjonBackdrop extends StatelessWidget {
  const MarjonBackdrop({super.key, required this.child, this.scrim = 0.62});
  final Widget child;
  final double scrim;

  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        Image.asset('assets/images/login_bg.jpg', fit: BoxFit.cover),
        ColoredBox(color: MC.n950.withValues(alpha: scrim)),
        child,
      ]);
}

class AuthCard extends StatelessWidget {
  const AuthCard({super.key, required this.child, this.maxWidth = 420});
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Container(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              decoration: BoxDecoration(
                color: const Color(0xFAFFFFFF),
                borderRadius: BorderRadius.circular(MC.rXl + 4),
                boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 40, offset: Offset(0, 16))],
              ),
              child: child,
            ),
          ),
        ),
      );
}

class Card2 extends StatelessWidget {
  const Card2({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.onTap, this.dashed = false, this.color, this.borderColor});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final bool dashed;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) => Material(
        color: color ?? MC.card,
        borderRadius: BorderRadius.circular(MC.rLg),
        child: InkWell(
          borderRadius: BorderRadius.circular(MC.rLg),
          onTap: onTap,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(MC.rLg),
              border: Border.all(color: borderColor ?? (dashed ? MC.n300 : MC.border), width: 1),
            ),
            child: child,
          ),
        ),
      );
}

// ── buttons ──────────────────────────────────────────────────────────────

class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.label, required this.onPressed, this.busy = false, this.icon, this.danger = false, this.height = 52});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  final bool danger;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: ElevatedButton(
          style: danger ? ElevatedButton.styleFrom(backgroundColor: MC.red500) : null,
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
              : Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                ]),
        ),
      );
}

class GhostButton extends StatelessWidget {
  const GhostButton({super.key, required this.label, required this.onPressed, this.icon, this.height = 48});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: OutlinedButton(
          onPressed: onPressed,
          child: Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 19, color: MC.teal600), const SizedBox(width: 8)],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          ]),
        ),
      );
}

class IconBtn extends StatelessWidget {
  const IconBtn({super.key, required this.icon, required this.onTap, this.tooltip, this.color, this.badge});
  final IconData icon;
  final VoidCallback? onTap;
  final String? tooltip;
  final Color? color;
  final String? badge;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip ?? '',
        child: InkResponse(
          onTap: onTap,
          radius: 24,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Stack(alignment: Alignment.center, children: [
              Icon(icon, size: 24, color: color ?? MC.textPrimary),
              if (badge != null)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(color: MC.amber500, borderRadius: BorderRadius.circular(9)),
                    child: Text(badge!, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ),
            ]),
          ),
        ),
      );
}

// ── small parts ──────────────────────────────────────────────────────────

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.bg = MC.n100, this.fg = MC.n600, this.dot = false, this.icon});
  final String label;
  final Color bg;
  final Color fg;
  final bool dot;
  final IconData? icon;

  factory Pill.free() => Pill(t('free'), dot: true);
  factory Pill.busy() => Pill(t('busy'), bg: MC.amber100, fg: MC.amber700, dot: true);
  factory Pill.ready() => Pill(t('ready'), bg: MC.green100, fg: MC.green600, dot: true);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) Container(width: 6, height: 6, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
          if (icon != null) Padding(padding: const EdgeInsets.only(right: 4), child: Icon(icon, size: 13, color: fg)),
          Text(label, style: MT.small.copyWith(color: fg, fontWeight: FontWeight.w600)),
        ]),
      );
}

class CountBadge extends StatelessWidget {
  const CountBadge(this.n, {super.key, this.active = false});
  final int n;
  final bool active;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 24),
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: active ? Colors.white.withValues(alpha: 0.28) : MC.n100, borderRadius: BorderRadius.circular(999)),
        child: Text('$n', textAlign: TextAlign.center, style: MT.small.copyWith(fontWeight: FontWeight.w700, color: active ? Colors.white : MC.n600)),
      );
}

class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.size = 56});
  final String? name;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: avatarColor(name), shape: BoxShape.circle),
        child: Text(initials(name), style: TextStyle(fontFamily: MC.fontDisplay, fontWeight: FontWeight.w700, fontSize: size * 0.38, color: Colors.white)),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.inbox_outlined, this.action});
  final String text;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 44, color: MC.n300),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: MT.bodyMuted),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

class ErrorState extends StatelessWidget {
  const ErrorState(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => EmptyState(
        message,
        icon: Icons.cloud_off_outlined,
        action: onRetry == null ? null : GhostButton(label: t('retry'), onPressed: onRetry, icon: Icons.refresh),
      );
}

class Labeled extends StatelessWidget {
  const Labeled(this.label, this.child, {super.key});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(bottom: 6, left: 2), child: Text(label, style: MT.label)),
        child,
      ]);
}

/// Numeric PIN pad (4 digits, submits on the 4th).
class PinDots extends StatelessWidget {
  const PinDots({super.key, required this.length, this.filled = 0, this.error = false});
  final int length;
  final int filled;
  final bool error;

  @override
  Widget build(BuildContext context) => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < length; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            margin: const EdgeInsets.symmetric(horizontal: 9),
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: error ? MC.red500 : (i < filled ? MC.teal500 : Colors.transparent),
              border: Border.all(color: error ? MC.red500 : (i < filled ? MC.teal500 : MC.n300), width: 2),
            ),
          ),
      ]);
}

class NumPad extends StatelessWidget {
  const NumPad({super.key, required this.onDigit, required this.onBackspace, this.disabled = false});
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final bool disabled;

  Widget _key(Widget child, VoidCallback? onTap) => Padding(
        padding: const EdgeInsets.all(5),
        child: Material(
          color: MC.n100,
          borderRadius: BorderRadius.circular(MC.rLg),
          child: InkWell(
            borderRadius: BorderRadius.circular(MC.rLg),
            onTap: disabled ? null : onTap,
            child: Center(child: child),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
    ];
    Widget digit(String d) => _key(
        Text(d, style: const TextStyle(fontFamily: MC.fontDisplay, fontSize: 26, fontWeight: FontWeight.w700, color: MC.textPrimary)),
        () => onDigit(d));
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: Column(children: [
        for (final r in rows) Expanded(child: Row(children: [for (final d in r) Expanded(child: digit(d))])),
        Expanded(
          child: Row(children: [
            const Expanded(child: SizedBox()),
            Expanded(child: digit('0')),
            Expanded(child: _key(const Icon(Icons.backspace_outlined, size: 24, color: MC.n600), onBackspace)),
          ]),
        ),
      ]),
    );
  }
}
