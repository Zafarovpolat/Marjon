import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';

const _units = ['кг', 'г', 'л', 'мл', 'шт', 'уп'];
num _num(String v) {
  final n = num.tryParse(v.replaceAll(',', '.'));
  return n != null && n >= 0 ? n : 0;
}

/// Warehouse records: purchase (with items), write-off, inventory check. Port of WarehouseWritePanel.
class WarehousePanel extends StatefulWidget {
  const WarehousePanel({super.key});
  @override
  State<WarehousePanel> createState() => _WarehousePanelState();
}

class _WarehousePanelState extends State<WarehousePanel> {
  String tab = 'purchase';
  List<Json> recent = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final d = await (tab == 'purchase' ? Api.i.purchases({}) : tab == 'writeoff' ? Api.i.writeOffs({}) : Api.i.inventoryChecks({}));
      recent = asJsonList(d is Map ? d['items'] : d).take(15).toList();
    } catch (_) {
      recent = [];
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _add() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _WarehouseForm(kind: tab)));
    if (ok == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = {'purchase': t('wh_tab_purchase'), 'writeoff': t('wh_tab_writeoff'), 'inventory': t('wh_tab_inventory')};
    return Scaffold(
      appBar: AppBar(title: Text(t('dev_warehouse'))),
      floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add), label: Text(t('wh_add'))),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
            for (final e in tabs.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(e.value), selected: tab == e.key, showCheckmark: false, onSelected: (_) {
                  setState(() => tab = e.key);
                  _load();
                }),
              ),
          ]),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : recent.isEmpty
                  ? EmptyState(t('emp_empty'), icon: Icons.inventory_2_outlined)
                  : ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 90), children: [
                      Text(t('wh_recent'), style: MT.small),
                      const SizedBox(height: 8),
                      for (final d in recent)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Card2(
                            child: Row(children: [
                              if (d['number'] != null) Padding(padding: const EdgeInsets.only(right: 10), child: Text('№${d['number']}', style: MT.money)),
                              Expanded(child: Text('${d['supplier'] ?? d['category'] ?? d['warehouse_name'] ?? d['check_type'] ?? '—'}', style: MT.body, maxLines: 1, overflow: TextOverflow.ellipsis)),
                              Text('${d['created_by_name'] ?? ''}', style: MT.small),
                            ]),
                          ),
                        ),
                    ]),
        ),
      ]),
    );
  }
}

class _Item {
  final name = TextEditingController();
  final qty = TextEditingController();
  final cost = TextEditingController();
  String unit = 'кг';
}

class _WarehouseForm extends StatefulWidget {
  const _WarehouseForm({required this.kind});
  final String kind;
  @override
  State<_WarehouseForm> createState() => _WarehouseFormState();
}

class _WarehouseFormState extends State<_WarehouseForm> {
  final a = TextEditingController(); // supplier | category | warehouse
  final b = TextEditingController(); // warehouse | items_count | check type
  final note = TextEditingController();
  final items = [_Item()];
  bool saving = false;

  Future<void> _save() async {
    if (saving) return;
    setState(() => saving = true);
    try {
      String? nn(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
      final needed = widget.kind == 'purchase' ? b : a;
      if (nn(needed) == null) {
        toast(context, widget.kind == 'writeoff' ? t('wh_category') : t('wh_warehouse'), error: true);
        return;
      }
      if (widget.kind == 'purchase') {
        final list = [
          for (final it in items)
            if (it.name.text.trim().isNotEmpty) {'name': it.name.text.trim(), 'quantity': _num(it.qty.text), 'unit': it.unit, 'cost_price': _num(it.cost.text)},
        ];
        if (list.isEmpty) {
          toast(context, t('wh_need_item'), error: true);
          return;
        }
        await Api.i.createPurchase({'supplier': nn(a), 'warehouse_name': nn(b), 'note': nn(note), 'items': list});
      } else if (widget.kind == 'writeoff') {
        await Api.i.createWriteOff({'category': nn(a), 'items_count': _num(b.text).truncate(), 'note': nn(note)});
      } else {
        await Api.i.createInventoryCheck({'warehouse_name': nn(a), 'comment': nn(note), if (nn(b) != null) 'check_type': nn(b)});
      }
      if (mounted) {
        toast(context, t('saved'));
        Navigator.of(context).pop(true);
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message.isEmpty ? t('save_failed') : e.message, error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kind;
    final title = k == 'purchase' ? t('wh_tab_purchase') : k == 'writeoff' ? t('wh_tab_writeoff') : t('wh_tab_inventory');
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Labeled(k == 'writeoff' ? t('wh_category') : k == 'purchase' ? t('wh_supplier') : t('wh_warehouse'), TextField(controller: a)),
        const SizedBox(height: 12),
        Labeled(k == 'writeoff' ? t('wh_items_count') : k == 'purchase' ? t('wh_warehouse') : t('wh_check_type'),
            TextField(controller: b, keyboardType: k == 'writeoff' ? TextInputType.number : TextInputType.text, decoration: InputDecoration(hintText: k == 'inventory' ? t('wh_check_type_ph') : null))),
        if (k == 'purchase') ...[
          const SizedBox(height: 16),
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card2(
                child: Column(children: [
                  Row(children: [
                    Expanded(child: TextField(controller: items[i].name, decoration: InputDecoration(labelText: t('wh_item_name')))),
                    if (items.length > 1) IconBtn(icon: Icons.delete_outline, color: MC.red500, onTap: () => setState(() => items.removeAt(i))),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: TextField(controller: items[i].qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: t('qty')))),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 84,
                      child: DropdownButtonFormField<String>(
                        initialValue: items[i].unit,
                        items: [for (final u in _units) DropdownMenuItem(value: u, child: Text(u))],
                        onChanged: (v) => setState(() => items[i].unit = v ?? items[i].unit),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: TextField(controller: items[i].cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: t('wh_cost')))),
                  ]),
                ]),
              ),
            ),
          GhostButton(label: t('wh_add_item'), icon: Icons.add, onPressed: () => setState(() => items.add(_Item()))),
        ],
        const SizedBox(height: 12),
        Labeled(t('comment'), TextField(controller: note, maxLength: 500)),
        const SizedBox(height: 8),
        BusyButton(label: t('save'), busy: saving, onPressed: _save),
      ]),
    );
  }
}
