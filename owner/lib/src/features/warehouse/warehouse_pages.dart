import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../../ui/records.dart';
import '../common/resource_page.dart';
import '../common/resources.dart';

class WarehouseHubPage extends StatelessWidget {
  const WarehouseHubPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Склад')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          _row(context, Icons.inventory_2_outlined, 'Остатки', () => push(context, const StockPage())),
          _row(context, Icons.move_to_inbox_outlined, 'Журнал приходов', () => push(context, const PurchasesPage())),
          _row(context, Icons.swap_horiz, 'Перемещения', () => push(context, ResourcePage(transfersConfig))),
          _row(context, Icons.fact_check_outlined, 'Инвентаризации', () => push(context, ResourcePage(warehouseJournal('Инвентаризации', '/warehouse/inventory-checks', Icons.fact_check_outlined)))),
          _row(context, Icons.delete_sweep_outlined, 'Списания', () => push(context, ResourcePage(warehouseJournal('Списания', '/warehouse/write-offs', Icons.delete_sweep_outlined)))),
        ]),
      );

  Widget _row(BuildContext context, IconData i, String l, VoidCallback t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card2(onTap: t, child: Row(children: [Icon(i, color: MC.teal600), const SizedBox(width: 14), Expanded(child: Text(l, style: MT.body.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right, color: MC.n300)])),
      );
}

class StockPage extends StatelessWidget {
  const StockPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Остатки')),
        body: AsyncBody<List<Json>>(
          load: () async => asJsonList(await Api.i.get('/inventory/ingredients')),
          builder: (_, rows, reload) => RefreshIndicator(onRefresh: reload, child: RecordCards(rows, titleKey: 'name')),
        ),
      );
}

class PurchasesPage extends StatefulWidget {
  const PurchasesPage({super.key});
  @override
  State<PurchasesPage> createState() => _PurchasesPageState();
}

class _PurchasesPageState extends State<PurchasesPage> {
  int gen = 0;

  Future<void> _addNew() async {
    final ok = await push<bool>(context, const PurchaseForm());
    if (ok == true) setState(() => gen++);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Журнал приходов')),
        floatingActionButton: FloatingActionButton.extended(onPressed: _addNew, icon: const Icon(Icons.add), label: const Text('Приход')),
        body: AsyncBody<List<Json>>(
          reloadKey: gen,
          load: () async => asJsonList(await Api.i.get('/warehouse/purchases')),
          builder: (_, rows, reload) => RefreshIndicator(onRefresh: reload, child: RecordCards(rows, titleKey: 'supplier')),
        ),
      );
}

class _Line {
  final name = TextEditingController();
  final qty = TextEditingController();
  final cost = TextEditingController();
  String unit = 'кг';
}

class PurchaseForm extends StatefulWidget {
  const PurchaseForm({super.key});
  @override
  State<PurchaseForm> createState() => _PurchaseFormState();
}

class _PurchaseFormState extends State<PurchaseForm> {
  final supplier = TextEditingController();
  final warehouse = TextEditingController();
  final note = TextEditingController();
  final lines = [_Line()];
  bool busy = false;

  num _n(String v) => num.tryParse(v.replaceAll(',', '.')) ?? 0;

  Future<void> _save() async {
    if (busy) return;
    final items = [
      for (final l in lines)
        if (l.name.text.trim().isNotEmpty) {'name': l.name.text.trim(), 'quantity': _n(l.qty.text), 'unit': l.unit, 'cost_price': _n(l.cost.text)},
    ];
    if (warehouse.text.trim().isEmpty || items.isEmpty) {
      toast(context, 'Укажите склад и хотя бы одну позицию', error: true);
      return;
    }
    setState(() => busy = true);
    try {
      await Api.i.post('/warehouse/purchases', data: {'supplier': supplier.text.trim().isEmpty ? null : supplier.text.trim(), 'warehouse_name': warehouse.text.trim(), 'note': note.text.trim().isEmpty ? null : note.text.trim(), 'items': items});
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Новый приход')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Labeled('Поставщик', TextField(controller: supplier)),
          const SizedBox(height: 12),
          Labeled('Склад *', TextField(controller: warehouse)),
          const SizedBox(height: 16),
          for (var i = 0; i < lines.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card2(
                child: Column(children: [
                  Row(children: [
                    Expanded(child: TextField(controller: lines[i].name, decoration: const InputDecoration(labelText: 'Товар'))),
                    if (lines.length > 1) IconBtn(icon: Icons.delete_outline, color: MC.red500, onTap: () => setState(() => lines.removeAt(i))),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: TextField(controller: lines[i].qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Кол-во'))),
                    const SizedBox(width: 8),
                    SizedBox(width: 84, child: DropdownButtonFormField<String>(initialValue: lines[i].unit, items: [for (final u in const ['кг', 'г', 'л', 'мл', 'шт', 'уп']) DropdownMenuItem(value: u, child: Text(u))], onChanged: (v) => setState(() => lines[i].unit = v ?? lines[i].unit))),
                    const SizedBox(width: 8),
                    Expanded(child: TextField(controller: lines[i].cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Цена'))),
                  ]),
                ]),
              ),
            ),
          GhostButton(label: 'Добавить позицию', icon: Icons.add, onPressed: () => setState(() => lines.add(_Line()))),
          const SizedBox(height: 12),
          Labeled('Комментарий', TextField(controller: note, maxLines: 2)),
          const SizedBox(height: 16),
          BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
        ]),
      );
}
