import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../net/api.dart';
import '../theme/tokens.dart';
import 'kit.dart';

String fmtDate(DateTime d) => DateFormat('dd.MM.yyyy').format(d);
String isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
String fmtDateTime(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  return d == null ? '' : DateFormat('dd.MM HH:mm').format(d);
}

String fmtTime(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  return d == null ? '' : DateFormat('HH:mm').format(d);
}

/// Loads data once, shows spinner / error with retry / the built body.
class AsyncBody<T> extends StatefulWidget {
  const AsyncBody({super.key, required this.load, required this.builder, this.reloadKey});
  final Future<T> Function() load;
  final Widget Function(BuildContext, T, Future<void> Function() reload) builder;
  final Object? reloadKey;
  @override
  State<AsyncBody<T>> createState() => _AsyncBodyState<T>();
}

class _AsyncBodyState<T> extends State<AsyncBody<T>> {
  T? data;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant AsyncBody<T> old) {
    super.didUpdateWidget(old);
    if (old.reloadKey != widget.reloadKey) _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      data = await widget.load();
      error = null;
    } on ApiError catch (e) {
      error = e.message;
    } catch (e) {
      error = 'Не удалось загрузить';
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) return const Center(child: CircularProgressIndicator());
    if (error != null && data == null) return ErrorState('Не удалось загрузить: $error', onRetry: _load);
    return widget.builder(context, data as T, _load);
  }
}

/// Section label used above groups of cards.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
        child: Row(children: [
          Expanded(child: Text(text.toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.6))),
          if (trailing != null) trailing!,
        ]),
      );
}

class KV extends StatelessWidget {
  const KV(this.k, this.v, {super.key, this.bold = false, this.color});
  final String k;
  final String v;
  final bool bold;
  final Color? color;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(k, style: MT.bodyMuted)),
          const SizedBox(width: 12),
          Flexible(child: Text(v, textAlign: TextAlign.right, style: (bold ? MT.money.copyWith(fontWeight: FontWeight.w700) : MT.body.copyWith(fontWeight: FontWeight.w600)).copyWith(color: color))),
        ]),
      );
}

/// Big number tile for dashboards.
class StatTile extends StatelessWidget {
  const StatTile(this.label, this.value, {super.key, this.icon, this.color = MC.teal600, this.sub});
  final String label;
  final String value;
  final IconData? icon;
  final Color color;
  final String? sub;
  @override
  Widget build(BuildContext context) => Card2(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (icon != null) ...[Icon(icon, size: 18, color: color), const SizedBox(width: 6)],
            Expanded(child: Text(label, style: MT.small, maxLines: 1, overflow: TextOverflow.ellipsis)),
          ]),
          const SizedBox(height: 8),
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: MT.h2.copyWith(color: MC.textPrimary))),
          if (sub != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub!, style: MT.small)),
        ]),
      );
}

/// From — To range with quick presets.
class DateRangeBar extends StatelessWidget {
  const DateRangeBar({super.key, required this.from, required this.to, required this.onChanged});
  final DateTime from;
  final DateTime to;
  final void Function(DateTime from, DateTime to) onChanged;

  Future<void> _pick(BuildContext context, bool isFrom) async {
    final d = await showDatePicker(context: context, initialDate: isFrom ? from : to, firstDate: DateTime(2023), lastDate: DateTime.now().add(const Duration(days: 1)));
    if (d == null) return;
    if (isFrom) {
      onChanged(d, d.isAfter(to) ? d : to);
    } else {
      onChanged(d.isBefore(from) ? d : from, d);
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final presets = <String, (DateTime, DateTime)>{
      'Сегодня': (today, today),
      'Вчера': (today.subtract(const Duration(days: 1)), today.subtract(const Duration(days: 1))),
      '7 дней': (today.subtract(const Duration(days: 6)), today),
      'Месяц': (DateTime(now.year, now.month, 1), today),
    };
    return Column(children: [
      Row(children: [
        Expanded(child: OutlinedButton.icon(onPressed: () => _pick(context, true), icon: const Icon(Icons.calendar_today, size: 16), label: Text(fmtDate(from)))),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('—')),
        Expanded(child: OutlinedButton.icon(onPressed: () => _pick(context, false), icon: const Icon(Icons.calendar_today, size: 16), label: Text(fmtDate(to)))),
      ]),
      const SizedBox(height: 8),
      SizedBox(
        height: 36,
        child: ListView(scrollDirection: Axis.horizontal, children: [
          for (final e in presets.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ActionChip(label: Text(e.key), onPressed: () => onChanged(e.value.$1, e.value.$2)),
            ),
        ]),
      ),
    ]);
  }
}

/// Horizontal single-choice chips.
class ChipTabs extends StatelessWidget {
  const ChipTabs({super.key, required this.items, required this.value, required this.onChanged});
  final Map<String, String> items;
  final String value;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 52,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
          for (final e in items.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(label: Text(e.value), selected: value == e.key, showCheckmark: false, onSelected: (_) => onChanged(e.key)),
            ),
        ]),
      );
}

Future<bool> confirm(BuildContext context, String title, {String? body, String action = 'Удалить', bool danger = true}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: Text(action, style: TextStyle(color: danger ? MC.red600 : MC.teal600))),
      ],
    ),
  );
  return r == true;
}

/// Pushes a page and returns its result.
Future<T?> push<T>(BuildContext context, Widget page) => Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));
