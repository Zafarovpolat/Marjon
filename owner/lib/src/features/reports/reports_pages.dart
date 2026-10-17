import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../../ui/export.dart';
import '../../ui/records.dart';

class _Kind {
  const _Kind(this.title, this.path, this.icon, this.titleKey, {this.filterPath, this.filters = const []});
  final String title;
  final String path;
  final IconData icon;
  final String? titleKey;
  final String? filterPath;
  // (key in filters response, query param, caption)
  final List<(String, String, String)> filters;
}

const _kinds = {
  'orders': _Kind('Отчёт по заказам', '/reports/orders', Icons.receipt_outlined, 'order_number', filterPath: '/reports/orders/filters', filters: [('waiters', 'waiter_id', 'Официанты'), ('cashiers', 'cashier_id', 'Кассиры'), ('products', 'product_id', 'Блюда')]),
  'waiters': _Kind('Отчёт по официантам', '/reports/waiters', Icons.person_pin_outlined, 'waiter_name', filterPath: '/reports/waiters/filters', filters: [('waiters', 'waiter_id', 'Официанты')]),
  'dishes': _Kind('Отчёт по блюдам', '/reports/dishes', Icons.restaurant_menu, 'name', filterPath: '/reports/dishes/filters', filters: [('authors', 'author_id', 'Авторы'), ('products', 'product_id', 'Блюда')]),
  'tables': _Kind('Отчёт по столам', '/reports/tables', Icons.grid_view_outlined, 'table_number', filterPath: '/reports/tables/filters', filters: [('waiters', 'waiter_id', 'Официанты'), ('cashiers', 'cashier_id', 'Кассиры'), ('places', 'hall_id', 'Залы')]),
  'cancelled': _Kind('Отменённые блюда', '/reports/cancelled', Icons.cancel_outlined, null, filterPath: '/reports/cancelled/filters', filters: [('authors', 'author_id', 'Кто отменил')]),
  'debt': _Kind('Дебиторы и кредиторы', '/reports/debt-credit', Icons.account_balance_wallet_outlined, null),
};

/// Hub with all reports of the web sidebar "Отчеты".
class ReportsHubPage extends StatelessWidget {
  const ReportsHubPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Отчёты')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Card2(
            onTap: () => push(context, const ZReportPage()),
            child: Row(children: [
              const Icon(Icons.receipt_long, color: MC.teal600),
              const SizedBox(width: 14),
              Expanded(child: Text('Z-отчёт', style: MT.body.copyWith(fontWeight: FontWeight.w600))),
              const Icon(Icons.chevron_right, color: MC.n300),
            ]),
          ),
          for (final e in _kinds.entries) ...[
            const SizedBox(height: 8),
            Card2(
              onTap: () => push(context, ReportPage(kind: e.key)),
              child: Row(children: [
                Icon(e.value.icon, color: MC.teal600),
                const SizedBox(width: 14),
                Expanded(child: Text(e.value.title, style: MT.body.copyWith(fontWeight: FontWeight.w600))),
                const Icon(Icons.chevron_right, color: MC.n300),
              ]),
            ),
          ],
        ]),
      );
}

/// A report for a period rendered as cards (columns come from the API).
class ReportPage extends StatefulWidget {
  const ReportPage({super.key, required this.kind});
  final String kind;
  @override
  State<ReportPage> createState() => _ReportPageState();
}

class _ReportPageState extends State<ReportPage> {
  DateTime from = DateTime.now();
  DateTime to = DateTime.now();
  int gen = 0;
  final Map<String, Set<String>> selected = {};
  Json? filterData;
  List<Json> _rows = [];

  Future<void> _export() => exportRowsAsCsv(context, filename: k.title, rows: _rows);

  _Kind get k => _kinds[widget.kind]!;

  int get _activeFilters => selected.values.fold(0, (a, b) => a + b.length);

  Future<void> _openFilters() async {
    try {
      filterData ??= asJson(await Api.i.get(k.filterPath!));
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
      return;
    }
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FilterSheet(kind: k, data: filterData!, selected: selected, onApply: () => setState(() => gen++)),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(k.title), actions: [
          IconBtn(icon: Icons.ios_share, tooltip: 'Экспорт в CSV', onTap: _export),
          if (k.filterPath != null) IconBtn(icon: Icons.filter_list, tooltip: 'Фильтры', badge: _activeFilters > 0 ? '$_activeFilters' : null, onTap: _openFilters),
        ]),
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 8), child: DateRangeBar(from: from, to: to, onChanged: (a, b) => setState(() {
                from = a;
                to = b;
                gen++;
              }))),
          Expanded(
            child: AsyncBody<List<Json>>(
              reloadKey: gen,
              load: () async => asJsonList(await Api.i.get(k.path, query: {'date_from': isoDate(from), 'date_to': isoDate(to), for (final e in selected.entries) if (e.value.isNotEmpty) e.key: e.value.toList()})),
              builder: (_, rows, reload) {
                _rows = rows;
                final sumKey = rows.isEmpty ? null : rows.first.keys.where((c) => RegExp(r'^(total|amount|revenue|total_amount|orders_total)$').hasMatch(c)).firstOrNull;
                final cards = RecordCards(
                  rows,
                  titleKey: k.titleKey != null && rows.isNotEmpty && rows.first.containsKey(k.titleKey) ? k.titleKey : null,
                  footer: sumKey == null
                      ? null
                      : Card2(color: MC.teal50, child: KV('Итого', fmtMoney(rows.fold<num>(0, (s, r) => s + toNum(r[sumKey]))), bold: true, color: MC.teal700)),
                );
                return RefreshIndicator(
                  onRefresh: reload,
                  child: widget.kind == 'dishes' && rows.isNotEmpty
                      ? Column(children: [_CategoryBreakdown(rows: rows), Expanded(child: cards)])
                      : cards,
                );
              },
            ),
          ),
        ]),
      );
}

/// Per-category revenue rollup shown above the dish list — the mobile
/// equivalent of web's MenuPage "Категории" sidebar, computed from the same
/// `/reports/dishes` rows (category_name/quantity/amount) client-side since
/// the backend report doesn't pre-aggregate by category.
class _CategoryBreakdown extends StatelessWidget {
  const _CategoryBreakdown({required this.rows});
  final List<Json> rows;

  @override
  Widget build(BuildContext context) {
    final grouped = <String, List<num>>{};
    for (final r in rows) {
      final raw = (r['category_name'] as String?)?.trim();
      final name = raw == null || raw.isEmpty ? 'Без категории' : raw;
      final cur = grouped.putIfAbsent(name, () => [0, 0]);
      cur[0] += toNum(r['quantity']);
      cur[1] += toNum(r['amount']);
    }
    final list = grouped.entries.toList()..sort((a, b) => b.value[1].compareTo(a.value[1]));
    if (list.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 104,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        itemCount: list.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final e = list[i];
          return SizedBox(
            width: 168,
            child: Card2(
              color: MC.teal50,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(e.key, style: MT.small.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(fmtMoney(e.value[1]), style: MT.money, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text('${fmtNum(e.value[0])} продано', style: MT.small, maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ),
          );
        },
      ),
    );
  }
}

const _zFin = [
  ['Валовые продажи', 'gross_sales'], ['Скидки', 'discounts_total'], ['Сервисный сбор', 'service_fee_total'], ['Налог', 'tax_total'],
  ['Возвраты', 'refunds_total'], ['Чистые продажи', 'net_sales'], ['Наличные', 'cash_total'], ['Получено наличными', 'cash_received_total'],
  ['Выдано сдачи', 'change_given_total'], ['Безналичные оплаты', 'non_cash_total'], ['Средний чек', 'avg_check'],
];
const _zCnt = [['Заказы', 'orders_count'], ['Отменённые заказы', 'cancelled_orders_count'], ['Оплаты', 'payments_count'], ['Фискальные чеки', 'fiscal_receipts_count']];

class ZReportPage extends StatefulWidget {
  const ZReportPage({super.key});
  @override
  State<ZReportPage> createState() => _ZReportPageState();
}

class _ZReportPageState extends State<ZReportPage> {
  DateTime from = DateTime.now();
  DateTime to = DateTime.now();
  int gen = 0;
  Json _z = const {};

  Future<void> _export() {
    final labels = {for (final e in [..._zFin, ..._zCnt]) e[1]: e[0]};
    return exportRowsAsCsv(context, filename: 'Z-отчёт', rows: [_z], columnLabels: labels);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Z-отчёт'), actions: [IconBtn(icon: Icons.ios_share, tooltip: 'Экспорт в CSV', onTap: _export)]),
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 8), child: DateRangeBar(from: from, to: to, onChanged: (a, b) => setState(() {
                from = a;
                to = b;
                gen++;
              }))),
          Expanded(
            child: AsyncBody<Json>(
              reloadKey: gen,
              load: () async {
                final same = isoDate(from) == isoDate(to);
                return asJson(await Api.i.get('/analytics/z-report', query: same ? {'date': isoDate(from)} : {'date_from': isoDate(from), 'date_to': isoDate(to)}));
              },
              builder: (_, z, reload) {
                _z = z;
                return RefreshIndicator(
                onRefresh: reload,
                child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
                  Card2(child: Column(children: [
                    for (final e in _zFin) KV(e[0], fmtMoney(toNum(z[e[1]])), bold: e[1] == 'net_sales', color: e[1] == 'net_sales' ? MC.teal600 : null),
                    const Divider(),
                    for (final e in _zCnt) KV(e[0], '${z[e[1]] ?? 0}'),
                  ])),
                  const SectionLabel('Способы оплаты'),
                  Card2(child: Column(children: [
                    if (asJsonList(z['payment_methods']).isEmpty) const Text('Нет данных', style: MT.bodyMuted),
                    for (final m in asJsonList(z['payment_methods'])) KV('${m['method']} ×${m['count']}', fmtMoney(toNum(m['amount']))),
                  ])),
                ]),
              );
              },
            ),
          ),
        ]),
      );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.kind, required this.data, required this.selected, required this.onApply});
  final _Kind kind;
  final Json data;
  final Map<String, Set<String>> selected;
  final VoidCallback onApply;
  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Фильтры', style: MT.h2)),
            TextButton(onPressed: () => setState(() => widget.selected.clear()), child: const Text('Сбросить')),
          ]),
          Flexible(
            child: SingleChildScrollView(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final f in widget.kind.filters)
                  if (asJsonList(widget.data[f.$1]).isNotEmpty) ...[
                    SectionLabel(f.$3),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final o in asJsonList(widget.data[f.$1]))
                        FilterChip(
                          label: Text('${o['label'] ?? o['name']}'),
                          selected: widget.selected[f.$2]?.contains('${o['value'] ?? o['id']}') ?? false,
                          showCheckmark: false,
                          onSelected: (v) => setState(() {
                            final set = widget.selected.putIfAbsent(f.$2, () => <String>{});
                            v ? set.add('${o['value'] ?? o['id']}') : set.remove('${o['value'] ?? o['id']}');
                          }),
                        ),
                    ]),
                  ],
              ]),
            ),
          ),
          const SizedBox(height: 16),
          BusyButton(label: 'Применить', onPressed: () {
            widget.onApply();
            Navigator.of(context).pop();
          }),
        ]),
      );
}
