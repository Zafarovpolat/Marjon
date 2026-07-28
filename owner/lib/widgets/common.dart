import 'package:flutter/material.dart';
import '../core/theme.dart';

// ── Number formatting ─────────────────────────────────────────────────────────

String fmtNum(double v, {bool compact = false}) {
  if (compact) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }
  if (v == 0) return '0';
  return v.toStringAsFixed(0).replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
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

String fmtDate(DateTime d) {
  final months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}

String fmtDateTime(String? iso) {
  if (iso == null) return '—';
  try {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day.toString().padLeft(2,'0')}.${d.month.toString().padLeft(2,'0')}.${d.year} '
        '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
  } catch (_) { return iso; }
}

String fmtIsoDate(DateTime d) =>
  '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';

// ── Shared UI widgets ─────────────────────────────────────────────────────────

// ── Responsive layout helpers ─────────────────────────────────────────────────

const double kBreakpointTablet = 600.0;
const double kMaxContentWidth  = 800.0;

/// Centers and constrains content to [maxWidth] on large screens.
/// On phones (< kBreakpointTablet) renders children as-is.
class ResponsiveBox extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  const ResponsiveBox({super.key, required this.child, this.maxWidth = kMaxContentWidth});

  @override
  Widget build(BuildContext context) {
    final screenW = MediaQuery.sizeOf(context).width;
    if (screenW < kBreakpointTablet) return child;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}

/// Returns the number of grid columns based on available width.
int responsiveCols(double width, {int phone = 2, int tablet = 3}) =>
    width >= kBreakpointTablet ? tablet : phone;

class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionHeader(this.title, {super.key, this.action, this.onAction});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(0, 20, 0, 12),
    child: Row(children: [
      Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
      const Spacer(),
      if (action != null)
        GestureDetector(
          onTap: onAction,
          child: Text(action!, style: const TextStyle(fontSize: 13, color: T.accent)),
        ),
    ]),
  );
}

class MCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final VoidCallback? onTap;
  final Color? color;
  const MCard({super.key, required this.child, this.padding, this.onTap, this.color});

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: color ?? T.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: T.border, width: 0.5),
    ),
    child: onTap != null
      ? InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(padding: padding ?? const EdgeInsets.all(14), child: child),
        )
      : Padding(padding: padding ?? const EdgeInsets.all(14), child: child),
  );
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? sub;
  const EmptyState({super.key, required this.icon, required this.message, this.sub});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 56, color: T.border),
        const SizedBox(height: 16),
        Text(message, style: const TextStyle(color: T.muted, fontSize: 15), textAlign: TextAlign.center),
        if (sub != null) ...[
          const SizedBox(height: 6),
          Text(sub!, style: const TextStyle(color: T.mutedDark, fontSize: 12), textAlign: TextAlign.center),
        ],
      ]),
    ),
  );
}

class LoadingCenter extends StatelessWidget {
  const LoadingCenter({super.key});
  @override
  Widget build(BuildContext context) =>
    const Center(child: CircularProgressIndicator(color: T.accent));
}

class MChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const MChip({super.key, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: selected ? T.accent : T.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: selected ? T.accent : T.border),
      ),
      child: Text(label, style: TextStyle(
        fontSize: 13, fontWeight: FontWeight.w500,
        color: selected ? Colors.white : T.muted,
      )),
    ),
  );
}

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  static const _labels = {
    'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится',
    'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён',
    'active': 'Активен', 'inactive': 'Неактивен',
  };

  Color get _color => switch (status) {
    'new'       => T.accent,
    'accepted'  => const Color(0xFF60A5FA),
    'cooking'   => T.warning,
    'ready'     => T.success,
    'completed' => T.mutedDark,
    'cancelled' => T.danger,
    'active'    => T.success,
    'inactive'  => T.mutedDark,
    _           => T.muted,
  };

  @override
  Widget build(BuildContext context) {
    final c = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.withValues(alpha: 0.3)),
      ),
      child: Text(_labels[status] ?? status,
        style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

// ── Date range picker helper ───────────────────────────────────────────────────

class DateRangeHeader extends StatelessWidget {
  final DateTime from;
  final DateTime to;
  final ValueChanged<DateTimeRange> onChanged;
  const DateRangeHeader({super.key, required this.from, required this.to, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final r = await showDateRangePicker(
          context: context,
          firstDate: DateTime(2024),
          lastDate: DateTime.now(),
          initialDateRange: DateTimeRange(start: from, end: to),
          builder: (_, child) => Theme(
            data: ThemeData.dark().copyWith(colorScheme: const ColorScheme.dark(primary: T.accent)),
            child: child!,
          ),
        );
        if (r != null) onChanged(r);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: T.border, width: 0.5),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.calendar_month_outlined, size: 15, color: T.muted),
          const SizedBox(width: 7),
          Text(
            '${fmtDate(from)}  —  ${fmtDate(to)}',
            style: const TextStyle(fontSize: 13, color: T.text, fontWeight: FontWeight.w500),
          ),
          const SizedBox(width: 6),
          const Icon(Icons.expand_more, size: 16, color: T.muted),
        ]),
      ),
    );
  }
}

// ── Bottom-sheet form helpers ─────────────────────────────────────────────────

class FormSheet extends StatelessWidget {
  final String title;
  final List<Widget> fields;
  final String submitLabel;
  final VoidCallback onSubmit;
  final bool loading;
  const FormSheet({
    super.key, required this.title, required this.fields,
    this.submitLabel = 'Сохранить', required this.onSubmit, this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, sc) => Container(
        decoration: const BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4,
            decoration: BoxDecoration(color: T.border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close, color: T.muted),
                onPressed: () => Navigator.pop(context),
                padding: EdgeInsets.zero, constraints: const BoxConstraints(),
              ),
            ]),
          ),
          const Divider(height: 1),
          Expanded(child: ListView(
            controller: sc,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            children: fields,
          )),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(context).viewInsets.bottom + 16),
            child: SizedBox(width: double.infinity, child: ElevatedButton(
              onPressed: loading ? null : onSubmit,
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              child: loading
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(submitLabel, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            )),
          ),
        ]),
      ),
    );
  }
}

Widget mField(String label, TextEditingController ctrl, {
  TextInputType? keyboard, bool obscure = false, String? hint, int maxLines = 1,
}) => Padding(
  padding: const EdgeInsets.only(bottom: 14),
  child: TextField(
    controller: ctrl,
    keyboardType: keyboard,
    obscureText: obscure,
    maxLines: maxLines,
    decoration: InputDecoration(labelText: label, hintText: hint),
  ),
);

Widget mDropdown<V>(String label, V? value, List<DropdownMenuItem<V>> items,
    ValueChanged<V?> onChanged) =>
  Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: DropdownButtonFormField<V>(
      value: value,
      items: items,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: T.bg,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: T.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: T.border)),
      ),
      dropdownColor: T.surface,
      style: const TextStyle(color: T.text, fontSize: 14),
    ),
  );

// ── Confirm dialog ────────────────────────────────────────────────────────────

Future<bool> confirmDialog(BuildContext context, {
  required String title, required String message, String confirmLabel = 'Удалить',
}) async {
  return await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      backgroundColor: T.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Text(title, style: const TextStyle(color: T.text, fontWeight: FontWeight.w700)),
      content: Text(message, style: const TextStyle(color: T.muted)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Отмена', style: TextStyle(color: T.muted)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel, style: const TextStyle(color: T.danger, fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  ) ?? false;
}

void showSnack(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: error ? T.danger : T.success,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
  ));
}
