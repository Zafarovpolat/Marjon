import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import 'history_panel.dart';

List<Json> _items(dynamic d) => asJsonList(d is Map ? d['items'] : d);

/// Batch print of summaries (accounts, tech cards, arrivals, inventory). Port of BatchPrintPanel.
class BatchPrintPanel extends StatefulWidget {
  const BatchPrintPanel({super.key, required this.branchId});
  final String branchId;
  @override
  State<BatchPrintPanel> createState() => _BatchPrintPanelState();
}

class _BatchPrintPanelState extends State<BatchPrintPanel> {
  String? busy;

  Future<({List<String> lines, int count})> _build(String key) async {
    switch (key) {
      case 'accounts':
        final users = _items(await Api.i.branchColleagues());
        return (lines: [for (final u in users) ['${u['name'] ?? '—'}', if (u['role_slug'] != null) tRole('${u['role_slug']}'), if (u['phone'] != null) '${u['phone']}'].join(' · ')], count: users.length);
      case 'techcards':
        final products = asJsonList(await Api.i.products());
        final lines = <String>[];
        var count = 0;
        for (var i = 0; i < products.length; i += 6) {
          final chunk = products.skip(i).take(6);
          final recipes = await Future.wait(chunk.map((p) => Api.i.recipe('${p['id']}').then<Json?>((r) => r).catchError((_) => null as Json?)));
          for (final r in recipes) {
            final ings = asJsonList(r?['items']);
            if (ings.isEmpty) continue;
            count++;
            lines.add('— ${r?['product_name'] ?? '—'} —');
            for (final g in ings) {
              lines.add('  • ${g['ingredient_name']}: ${g['quantity'] ?? ''}${g['unit'] != null ? ' ${g['unit']}' : ''}');
            }
          }
        }
        return (lines: lines, count: count);
      case 'arrivals':
        final d = _items(await Api.i.purchases({}));
        return (lines: [for (final x in d) ['#${x['number'] ?? '—'}', '${x['supplier'] ?? '—'}', fmtMoney(toNum(x['total_amount'])), if (x['status'] != null) '${x['status']}'].join(' · ')], count: d.length);
      default:
        final d = _items(await Api.i.inventoryChecks({}));
        return (lines: [for (final c in d) ['${c['warehouse_name'] ?? '—'}', if (c['check_type'] != null) '${c['check_type']}', if (c['status'] != null) '${c['status']}', if (c['created_by_name'] != null) '${c['created_by_name']}'].join(' · ')], count: d.length);
    }
  }

  Future<void> _print(String key, String label) async {
    if (busy != null) return;
    setState(() => busy = key);
    try {
      final r = await _build(key);
      if (!mounted) return;
      if (r.lines.isEmpty) {
        toast(context, t('dev_empty'));
        return;
      }
      await printLinesToReceipt(context, branchId: widget.branchId, title: label, lines: r.lines, footer: '${t('total')}: ${r.count}');
    } on ApiError catch (e) {
      if (mounted) toast(context, '${t('print_failed')}: ${e.message}', error: true);
    } finally {
      if (mounted) setState(() => busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cats = [
      ('accounts', t('dev_accounts'), Icons.groups_outlined),
      ('techcards', t('dev_techcards'), Icons.description_outlined),
      ('arrivals', t('dev_arrivals'), Icons.inventory_2_outlined),
      ('inventory', t('dev_inventory'), Icons.fact_check_outlined),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(t('print'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(t('dev_hint'), style: MT.bodyMuted),
        const SizedBox(height: 14),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.95,
          children: [
            for (final c in cats)
              Card2(
                onTap: busy != null ? null : () => _print(c.$1, c.$2),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  busy == c.$1 ? const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.4)) : Icon(c.$3, size: 30, color: MC.teal600),
                  const SizedBox(height: 10),
                  Text(c.$2, textAlign: TextAlign.center, style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                  Text(busy == c.$1 ? t('dev_printing') : t('print'), style: MT.small),
                ]),
              ),
          ],
        ),
      ]),
    );
  }
}
