import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';

Future<void> printLinesToReceipt(BuildContext context, {required String branchId, required String title, required List<String> lines, String? footer}) async {
  try {
    final printers = asJsonList(await Api.i.printers());
    final p = printers.where((x) => x['printer_type'] == 'receipt' && '${x['branch_id']}' == branchId).firstOrNull;
    if (p == null) {
      if (context.mounted) toast(context, t('no_receipt_printer'), error: true);
      return;
    }
    await Api.i.printSummary({'printer_id': p['id'], 'title': title, 'lines': lines, if (footer != null) 'footer': footer, 'copies': 1});
    if (context.mounted) toast(context, t('receipt_sent'));
  } on ApiError catch (e) {
    if (context.mounted) toast(context, '${t('print_failed')}${e.message.isEmpty ? '' : ': ${e.message}'}', error: true);
  }
}

/// Order history of the branch with a type filter and a summary print. Port of HistoryPanel.
class HistoryPanel extends StatefulWidget {
  const HistoryPanel({super.key, required this.branchId});
  final String branchId;
  @override
  State<HistoryPanel> createState() => _HistoryPanelState();
}

class _HistoryPanelState extends State<HistoryPanel> {
  List<Json> rows = [];
  bool loading = true;
  String type = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      rows = asJsonList(await Api.i.orders(branchId: widget.branchId));
    } catch (_) {
      rows = [];
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final types = {'all': t('all'), 'dine_in': t('dine_in'), 'takeaway': t('takeaway'), 'delivery': t('delivery')};
    final shown = type == 'all' ? rows : rows.where((o) => o['order_type'] == type).toList();
    return Scaffold(
      appBar: AppBar(title: Text(t('hist_title')), actions: [IconBtn(icon: Icons.refresh, onTap: _load)]),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
            for (final e in types.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(e.value), selected: type == e.key, showCheckmark: false, onSelected: (_) => setState(() => type = e.key)),
              ),
          ]),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : shown.isEmpty
                  ? EmptyState(t('no_orders_found'), icon: Icons.receipt_long_outlined)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: shown.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final o = shown[i];
                        final d = DateTime.tryParse('${o['created_at'] ?? ''}')?.toLocal();
                        final cancelled = '${o['status']}' == 'cancelled';
                        return Card2(
                          child: Row(children: [
                            Text('#${o['order_number'] ?? '—'}', style: MT.money.copyWith(fontSize: 16, color: MC.textPrimary)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(o['table_number'] != null ? '${t('table')} ${o['table_number']}' : (o['order_type'] != null ? tType('${o['order_type']}') : '—'), style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                Text(d == null ? '' : DateFormat('dd.MM HH:mm').format(d), style: MT.small),
                              ]),
                            ),
                            Pill(tStatus('${o['status']}'), bg: cancelled ? MC.red100 : MC.n100, fg: cancelled ? MC.red600 : MC.n600),
                          ]),
                        );
                      },
                    ),
        ),
        if (!loading && shown.isNotEmpty)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: GhostButton(
                label: t('print_summary'),
                icon: Icons.print_outlined,
                onPressed: () => printLinesToReceipt(
                  context,
                  branchId: widget.branchId,
                  title: t('hist_title'),
                  lines: [for (final o in shown) '#${o['order_number'] ?? '—'} ${o['table_number'] != null ? '${t('table')} ${o['table_number']}' : tType('${o['order_type']}')}'],
                  footer: '${t('total')}: ${shown.length}',
                ),
              ),
            ),
          ),
      ]),
    );
  }
}
