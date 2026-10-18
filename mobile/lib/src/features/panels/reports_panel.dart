import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import 'history_panel.dart';

const _colKey = {
  'name': 'col_name', 'title': 'col_name', 'product': 'col_product', 'staff': 'col_staff', 'cashier': 'col_cashier',
  'count': 'col_count', 'qty': 'col_count', 'quantity': 'col_count', 'dishes_count': 'col_count', 'orders': 'col_orders', 'orders_count': 'col_orders',
  'total': 'col_sum', 'amount': 'col_sum', 'sum': 'col_sum', 'orders_total': 'col_sum', 'revenue': 'col_revenue', 'date': 'col_date',
  'service_fee': 'col_service', 'waiter_share': 'col_share', 'price': 'col_price', 'unit': 'col_unit', 'profit': 'col_profit',
  'waiter_name': 'col_waiter', 'avg_check': 'col_avg',
};
const _zFin = [
  ['z_gross', 'gross_sales'], ['z_discounts', 'discounts_total'], ['z_service', 'service_fee_total'], ['z_tax', 'tax_total'],
  ['z_refunds', 'refunds_total'], ['z_net', 'net_sales'], ['z_cash', 'cash_total'], ['z_cash_received', 'cash_received_total'],
  ['z_change', 'change_given_total'], ['z_non_cash', 'non_cash_total'], ['z_avg', 'avg_check'],
];
const _zCnt = [['z_orders', 'orders_count'], ['z_cancelled', 'cancelled_orders_count'], ['z_payments', 'payments_count'], ['z_fiscal', 'fiscal_receipts_count']];
final _moneyCol = RegExp(r'total|amount|revenue|sum|price|fee|share|profit|cost', caseSensitive: false);

/// Dish / staff / Z reports for a period. Port of ReportsPanel.
class ReportsPanel extends StatefulWidget {
  const ReportsPanel({super.key, required this.user, required this.branchId});
  final Json? user;
  final String branchId;
  @override
  State<ReportsPanel> createState() => _ReportsPanelState();
}

class _ReportsPanelState extends State<ReportsPanel> {
  String tab = 'products';
  DateTime from = DateTime.now();
  DateTime to = DateTime.now();
  List<Json>? rows;
  Json? z;
  bool loading = false;
  bool err = false;

  String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
  String _show(DateTime d) => DateFormat('dd.MM.yyyy').format(d);

  Future<void> _pick(bool isFrom) async {
    final d = await showDatePicker(context: context, initialDate: isFrom ? from : to, firstDate: DateTime(2024), lastDate: DateTime.now().add(const Duration(days: 1)));
    if (d != null) setState(() => isFrom ? from = d : to = d);
  }

  Future<void> _run() async {
    setState(() {
      loading = true;
      err = false;
      rows = null;
      z = null;
    });
    try {
      if (tab == 'z') {
        z = asJson(await Api.i.zReport(_iso(from), _iso(to)));
      } else {
        final q = {'date_from': _iso(from), 'date_to': _iso(to), 'branch_id': widget.branchId};
        final d = await (tab == 'staff' ? Api.i.reportWaiters(q) : Api.i.reportDishes(q));
        rows = asJsonList(d is List ? d : (d is Map ? (d['items'] ?? d['rows'] ?? d['data'] ?? [d]) : []));
      }
    } on ApiError catch (e) {
      err = true;
      rows = [];
      if (mounted) toast(context, e.message.isEmpty ? t('rep_error') : '${t('rep_error')}: ${e.message}', error: true);
    }
    if (mounted) setState(() => loading = false);
  }

  String _cell(String k, dynamic v) {
    if (v == null || v == '') return '—';
    if (_moneyCol.hasMatch(k) && v is num) return fmtNum(v);
    if (_moneyCol.hasMatch(k) && num.tryParse('$v') != null) return fmtNum(num.parse('$v'));
    return '$v';
  }

  List<String> _cols() {
    if (rows == null || rows!.isEmpty) return [];
    return rows!.first.keys.where((k) => rows!.first[k] is! Map && rows!.first[k] is! List && !RegExp(r'_id$|^id$', caseSensitive: false).hasMatch(k)).take(8).toList();
  }

  Future<void> _printTable() async {
    final cols = _cols();
    if (cols.isEmpty) return;
    final nameC = cols.firstWhere((c) => RegExp(r'name|title|product|staff|cashier|waiter', caseSensitive: false).hasMatch(c), orElse: () => cols.first);
    final sumC = cols.where((c) => RegExp(r'total|amount|revenue|sum', caseSensitive: false).hasMatch(c)).firstOrNull;
    final lines = [for (final r in rows!) sumC != null ? '${r[nameC] ?? '—'} — ${fmtNum(toNum(r[sumC]))}' : '${r[nameC] ?? '—'}'];
    final footer = sumC != null ? '${t('total')}: ${fmtNum(rows!.fold<num>(0, (s, r) => s + toNum(r[sumC])))} ${t('currency')}' : '${t('total')}: ${rows!.length}';
    await printLinesToReceipt(context, branchId: widget.branchId, title: tab == 'staff' ? t('rep_staff') : t('rep_products'), lines: ['${_show(from)} — ${_show(to)}', ...lines], footer: footer);
  }

  Future<void> _printZ() async {
    final zz = z!;
    String m(dynamic v) => fmtNum(toNum(v));
    await printLinesToReceipt(
      context,
      branchId: widget.branchId,
      title: '${t('rep_z')} · ${_show(from)}${_iso(from) != _iso(to) ? ' — ${_show(to)}' : ''}',
      lines: [
        for (final e in _zFin) '${t(e[0])} — ${m(zz[e[1]])}',
        for (final e in _zCnt) '${t(e[0])} — ${zz[e[1]] ?? 0}',
        '${t('z_pay_methods')}:',
        for (final pm in asJsonList(zz['payment_methods'])) '  ${pm['method']} ×${pm['count']} — ${m(pm['amount'])}',
      ],
      footer: '${t('z_net')}: ${m(zz['net_sales'])} ${t('currency')}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final tabs = {'products': t('rep_products'), 'staff': t('rep_staff'), if (Perm.must(widget.user, 'can_view_z_report')) 'z': t('rep_z')};
    return Scaffold(
      appBar: AppBar(title: Text(t('reports'))),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
            for (final e in tabs.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(e.value), selected: tab == e.key, showCheckmark: false, onSelected: (_) {
                  setState(() => tab = e.key);
                  _run();
                }),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: () => _pick(true), icon: const Icon(Icons.calendar_today, size: 16), label: Text(_show(from)))),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('—')),
            Expanded(child: OutlinedButton.icon(onPressed: () => _pick(false), icon: const Icon(Icons.calendar_today, size: 16), label: Text(_show(to)))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: SizedBox(width: double.infinity, height: 44, child: ElevatedButton(onPressed: _run, child: Text(t('generate')))),
        ),
        Expanded(child: _body()),
      ]),
    );
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (tab == 'z') {
      if (z == null) return EmptyState(err ? t('rep_unavailable') : t('rep_hint'), icon: Icons.bar_chart);
      final zz = z!;
      return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        Card2(child: Column(children: [
          _kv(t('z_closed'), zz['is_closed'] == true ? t('z_yes') : t('z_no')),
          _kv(t('z_shift_open'), '${zz['shift_opened_at'] ?? '—'}'),
          _kv(t('z_shift_close'), '${zz['shift_closed_at'] ?? '—'}'),
        ])),
        const SizedBox(height: 10),
        Card2(child: Column(children: [
          for (final e in _zFin) _kv(t(e[0]), '${fmtNum(toNum(zz[e[1]]))} ${t('currency')}', bold: e[0] == 'z_net'),
          const Divider(),
          for (final e in _zCnt) _kv(t(e[0]), '${zz[e[1]] ?? 0}'),
        ])),
        const SizedBox(height: 10),
        Card2(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t('z_pay_methods'), style: MT.label),
          const SizedBox(height: 6),
          if (asJsonList(zz['payment_methods']).isEmpty) Text(t('z_no_data'), style: MT.bodyMuted),
          for (final pm in asJsonList(zz['payment_methods'])) _kv('${pm['method']} ×${pm['count']}', '${fmtNum(toNum(pm['amount']))} ${t('currency')}'),
        ])),
        const SizedBox(height: 12),
        GhostButton(label: t('z_print'), icon: Icons.print_outlined, onPressed: _printZ),
      ]);
    }
    if (rows == null) return EmptyState(t('rep_hint'), icon: Icons.bar_chart);
    if (rows!.isEmpty) return EmptyState(err ? t('rep_unavailable') : t('rep_no_data'), icon: Icons.bar_chart);
    final cols = _cols();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
      for (final r in rows!)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Card2(
            child: Column(children: [
              for (final c in cols) _kv(_colKey[c] != null ? t(_colKey[c]!) : c, _cell(c, r[c])),
            ]),
          ),
        ),
      GhostButton(label: t('print_summary'), icon: Icons.print_outlined, onPressed: _printTable),
    ]);
  }

  Widget _kv(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(k, style: MT.bodyMuted)),
          const SizedBox(width: 12),
          Flexible(child: Text(v, textAlign: TextAlign.right, style: bold ? MT.money.copyWith(color: MC.teal600, fontWeight: FontWeight.w700) : MT.body.copyWith(fontWeight: FontWeight.w600))),
        ]),
      );
}
