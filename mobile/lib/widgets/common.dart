import 'package:flutter/material.dart';
import '../core/theme.dart';

// ── Number / date formatters ─────────────────────────────────────────────────

String fmtNum(dynamic v, {bool compact = false}) {
  final n = toDouble(v);
  if (compact) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000)    return '${(n / 1000).toStringAsFixed(1)}K';
  }
  return n.toStringAsFixed(0)
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}

double toDouble(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

int toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

String fmtIsoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String fmtDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return '';
  final h = dt.hour.toString().padLeft(2, '0');
  final m = dt.minute.toString().padLeft(2, '0');
  return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')} $h:$m';
}

String waitTime(String? iso) {
  if (iso == null) return '';
  final dt = DateTime.tryParse(iso);
  if (dt == null) return '';
  final diff = DateTime.now().toUtc().difference(dt);
  if (diff.inMinutes < 1) return 'Только что';
  if (diff.inMinutes < 60) return '${diff.inMinutes} мин';
  return '${diff.inHours}ч ${diff.inMinutes % 60}м';
}

Color waitColor(String? iso) {
  if (iso == null) return AppTheme.textMuted;
  final dt = DateTime.tryParse(iso);
  if (dt == null) return AppTheme.textMuted;
  final mins = DateTime.now().toUtc().difference(dt).inMinutes;
  if (mins < 10) return AppTheme.success;
  if (mins < 20) return AppTheme.warning;
  return AppTheme.danger;
}

String orderStatusLabel(String s) {
  const map = {
    'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится',
    'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён',
  };
  return map[s] ?? s;
}

int responsiveCols(double width) {
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

void showSnack(BuildContext ctx, String msg, {bool error = false}) {
  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: error ? AppTheme.danger : null,
  ));
}

Future<bool> confirmDialog(BuildContext ctx,
    {required String title, required String message}) async {
  final result = await showDialog<bool>(
    context: ctx,
    builder: (_) => AlertDialog(
      backgroundColor: AppTheme.surface,
      title: Text(title, style: const TextStyle(color: AppTheme.textColor)),
      content: Text(message, style: const TextStyle(color: AppTheme.textMuted)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Отмена', style: TextStyle(color: AppTheme.textMuted)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Удалить', style: TextStyle(color: AppTheme.danger)),
        ),
      ],
    ),
  );
  return result ?? false;
}

// ── Widgets ──────────────────────────────────────────────────────────────────

class ResponsiveBox extends StatelessWidget {
  final Widget child;
  const ResponsiveBox({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width < 600) return child;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 800),
        child: child,
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? sub;
  const EmptyState({super.key, required this.icon, required this.message, this.sub});

  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 56, color: AppTheme.border),
      const SizedBox(height: 16),
      Text(message,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
      if (sub != null) ...[
        const SizedBox(height: 6),
        Text(sub!, textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
      ],
    ]),
  );
}

class LoadingCenter extends StatelessWidget {
  const LoadingCenter({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  Color get _color {
    const map = {
      'new':      AppTheme.accentLight,
      'accepted': Color(0xFF4ADE80),
      'cooking':  Color(0xFFFB923C),
      'ready':    Color(0xFF86EFAC),
      'completed': AppTheme.textMuted,
      'cancelled': AppTheme.danger,
    };
    return map[status] ?? AppTheme.textMuted;
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: _color.withValues(alpha: 0.2),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Text(orderStatusLabel(status),
      style: TextStyle(color: _color, fontSize: 12, fontWeight: FontWeight.w600)),
  );
}

class DragHandle extends StatelessWidget {
  const DragHandle({super.key});
  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      width: 40, height: 4, margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.border, borderRadius: BorderRadius.circular(2)),
    ),
  );
}

// Pulsing "LIVE" badge — dot scales continuously
class LivePulse extends StatefulWidget {
  const LivePulse({super.key});
  @override
  State<LivePulse> createState() => _LivePulseState();
}

class _LivePulseState extends State<LivePulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 700))
      ..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.45, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(right: 12),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: AppTheme.danger, borderRadius: BorderRadius.circular(4)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      ScaleTransition(
        scale: _scale,
        child: Container(
          width: 8, height: 8,
          decoration: const BoxDecoration(
            color: Colors.white, shape: BoxShape.circle)),
      ),
      const SizedBox(width: 6),
      const Text('LIVE', style: TextStyle(
        fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white)),
    ]),
  );
}
