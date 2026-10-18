import 'package:flutter/material.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../session/session.dart';
import '../../theme/tokens.dart';
import '../../ui/dialogs.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import '../floor/floor_view.dart';
import '../order/order_builder.dart';

/// Waiter: floor, table detail (items + actions), new order / add dishes.
class WaiterMode extends StatefulWidget {
  const WaiterMode({super.key, required this.session});
  final Session session;
  @override
  State<WaiterMode> createState() => _WaiterModeState();
}

class _WaiterModeState extends State<WaiterMode> {
  late final FloorData floor = FloorData(widget.session.branchId);
  String zone = 'all';
  Map<String, Json> printers = {};

  Json? get user => widget.session.staffUser;
  String get branchId => widget.session.branchId;

  @override
  void initState() {
    super.initState();
    floor.addListener(_rebuild);
    _loadPrinters();
  }

  @override
  void dispose() {
    floor.removeListener(_rebuild);
    floor.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Future<void> _loadPrinters() async {
    try {
      final l = asJsonList(await Api.i.printers());
      if (mounted) setState(() => printers = {for (final p in l) '${p['id']}': p});
    } catch (_) {}
  }

  // A waiter always starts from a table on the floor — only the cashier
  // handles orders with no table (takeaway/delivery/dine-in-no-table).
  Future<void> _openBuilder(Json table, {String? addToOrderId}) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => OrderBuilderScreen(
        title: '${t('table')} ${table['number']}',
        submitLabel: addToOrderId != null ? t('add_dishes') : t('to_kitchen'),
        showGuests: addToOrderId == null,
        canTakeaway: Perm.can(user, 'can_takeaway_at_table'),
        canDeleteLines: Perm.can(user, 'can_delete_dishes'),
        onSubmit: (o) async {
          if (addToOrderId != null) {
            for (final l in o.lines) {
              await Api.i.addItem(addToOrderId, l.toItemJson());
            }
            try {
              await Api.i.updateOrderStatus(addToOrderId, 'cooking');
            } catch (_) {}
          } else {
            await Api.i.createOrder({
              'branch_id': branchId,
              'order_type': 'dine_in',
              'table_number': '${table['number']}',
              'persons_count': o.guests,
              'note': o.note.isEmpty ? null : o.note,
              'items': [for (final l in o.lines) l.toItemJson()],
            });
          }
        },
      ),
    ));
    if (ok == true) {
      floor.load();
      if (mounted) toast(context, t('order_created'));
    }
  }

  void _tapTable(Json tb) {
    final o = floor.orderFor(tb['number']);
    if (o == null) {
      _openBuilder(tb);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TableDetailScreen(
        table: tb,
        orderId: '${o['id']}',
        initial: o,
        user: user,
        branchId: branchId,
        printers: printers,
        floor: floor,
        onAdd: (order) => _openBuilder(tb, addToOrderId: '${order['id']}'),
      ),
    )).then((_) => floor.load());
  }

  @override
  Widget build(BuildContext context) {
    final all = floor.allTables;
    final shown = zone == 'all' ? all : all.where((t) => t['zoneId'] == zone).toList();
    final cFree = shown.where((t) => floor.stateOf(t['number']) == TableState.free).length;
    final cReady = shown.where((t) => floor.stateOf(t['number']) == TableState.ready).length;
    final cBusy = shown.length - cFree - cReady;
    Widget legend(Color c, int n) => Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Row(children: [Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))), const SizedBox(width: 4), Text('$n', style: MT.small.copyWith(fontWeight: FontWeight.w700))]),
        );
    return FloorView(
      floor: floor,
      activeZone: zone,
      onZone: (z) => setState(() => zone = z),
      onTable: _tapTable,
      actions: [
        legend(MC.n300, cFree),
        legend(MC.amber500, cBusy),
        legend(MC.green500, cReady),
      ],
    );
  }
}

class TableDetailScreen extends StatefulWidget {
  const TableDetailScreen({
    super.key,
    required this.table,
    required this.orderId,
    required this.initial,
    required this.user,
    required this.branchId,
    required this.printers,
    required this.floor,
    required this.onAdd,
  });
  final Json table;
  final String orderId;
  final Json initial;
  final Json? user;
  final String branchId;
  final Map<String, Json> printers;
  final FloorData floor;
  final Future<void> Function(Json order) onAdd;

  @override
  State<TableDetailScreen> createState() => _TableDetailScreenState();
}

class _TableDetailScreenState extends State<TableDetailScreen> {
  late Json order = widget.initial;

  Future<void> _refresh() async {
    try {
      final o = await Api.i.order(widget.orderId);
      if (mounted) setState(() => order = o);
    } catch (_) {
      if (mounted) Navigator.pop(context);
    }
  }

  // Risky actions need the manage-orders permission AND a separate PIN confirmation.
  void _requirePin(VoidCallback action) => showPrompt(
        context,
        title: t('confirm_pin'),
        hint: t('enter_pin'),
        password: true,
        number: true,
        submitLabel: t('pin_confirm'),
        onSubmit: (pin, _) async {
          final u = await Api.i.verifyPin(pin, null);
          if (!Perm.must(u, 'can_manage_orders')) throw ApiError(t('no_permission'));
          if (mounted) WidgetsBinding.instance.addPostFrameCallback((_) => action());
        },
      );

  Future<void> _printReceipt() async {
    Json? pr;
    for (final p in widget.printers.values) {
      if (p['printer_type'] == 'receipt' && '${p['branch_id']}' == widget.branchId) pr = p;
    }
    if (pr == null) {
      toast(context, t('no_receipt_printer'), error: true);
      return;
    }
    try {
      await Api.i.printReceipt({'order_id': order['id'], 'printer_id': pr['id'], 'copies': 1});
      if (mounted) toast(context, t('receipt_sent'));
    } on ApiError catch (e) {
      if (mounted) toast(context, '${t('print_failed')}: ${e.message}', error: true);
    }
  }

  void _moveItem(Json item) => showPrompt(
        context,
        title: t('move_to_table'),
        hint: t('move_to_table'),
        options: [for (final tb in widget.floor.allTables) PromptOption('${tb['number']}', '${t('table')} ${tb['number']}')],
        submitLabel: t('save'),
        onSubmit: (tbl, _) async {
          await Api.i.moveItem('${order['id']}', '${item['id']}', tbl);
          if (mounted) Navigator.pop(context);
        },
      );

  void _removeItem(Json item) => showPrompt(
        context,
        title: t('delete_dish'),
        hint: t('delete_reason'),
        placeholder: t('delete_reason_ph'),
        submitLabel: t('delete_dish'),
        onSubmit: (reason, _) async {
          await Api.i.removeItem('${order['id']}', '${item['id']}', reason: reason);
          await _refresh();
        },
      );

  void _cancelOrder() => showPrompt(
        context,
        title: t('cancel_order'),
        hint: t('cancel_comment'),
        placeholder: t('cancel_comment_ph'),
        submitLabel: t('cancel_order'),
        onSubmit: (reason, _) async {
          await Api.i.cancelOrder('${order['id']}', comment: reason);
          if (mounted) Navigator.pop(context);
        },
      );

  void _reassign() => showPrompt(
        context,
        title: t('move_table'),
        hint: t('move_to_table'),
        options: [for (final tb in widget.floor.allTables) PromptOption('${tb['number']}', '${t('table')} ${tb['number']}')],
        initial: '${order['table_number'] ?? ''}',
        extra: (label: t('move_reason'), placeholder: t('move_reason_ph')),
        submitLabel: t('save'),
        onSubmit: (tbl, reason) async {
          await Api.i.updateOrder('${order['id']}', {'table_number': tbl, if (reason.isNotEmpty) 'reason': reason});
          if (mounted) Navigator.pop(context);
        },
      );

  (Color, Color) _statusColors(String? s) => switch (s) {
        'ready' => (MC.green100, MC.green600),
        'cooking' => (MC.amber100, MC.amber700),
        'accepted' => (MC.teal100, MC.teal700),
        _ => (MC.n100, MC.n600),
      };

  @override
  Widget build(BuildContext context) {
    final items = asJsonList(order['items']);
    final manage = Perm.must(widget.user, 'can_manage_orders');
    final (bg, fg) = _statusColors(order['status'] as String?);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          Text('${t('table')} ${widget.table['number']}', style: MT.title),
          const SizedBox(width: 10),
          if (order['status'] != null) Pill(tStatus('${order['status']}'), bg: bg, fg: fg, dot: true),
        ]),
        bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Container(height: 1, color: MC.border)),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          Wrap(spacing: 14, children: [
            Text('${t('order_no')} #${order['order_number'] ?? ''}', style: MT.label),
            Text(fmtTime(order['created_at']), style: MT.small),
            Text(fmtMoney(toNum(order['total_amount'])), style: MT.money),
          ]),
          const SizedBox(height: 12),
          for (final it in items) _itemTile(it, manage),
          const SizedBox(height: 16),
          BusyButton(label: t('add_dishes'), icon: Icons.add, onPressed: () async {
            await widget.onAdd(order);
            _refresh();
          }),
          const SizedBox(height: 10),
          GhostButton(label: t('print_receipt'), icon: Icons.print_outlined, onPressed: _printReceipt),
          if (manage) ...[
            const SizedBox(height: 10),
            GhostButton(label: t('move_table'), icon: Icons.swap_horiz, onPressed: () => _requirePin(_reassign)),
            const SizedBox(height: 10),
            BusyButton(label: t('cancel_order'), icon: Icons.block, danger: true, onPressed: () => _requirePin(_cancelOrder)),
          ],
        ]),
      ),
    );
  }

  Widget _itemTile(Json it, bool manage) {
    final sub = [
      fmtMoney(toNum(it['total'] ?? toNum(it['price']) * toNum(it['quantity']))),
      if ((it['waiter_name'] ?? it['added_by_name']) != null) '${it['waiter_name'] ?? it['added_by_name']}',
      if (it['created_at'] != null) fmtTime(it['created_at']),
    ].join(' · ');
    final st = it['status'] as String?;
    final (bg, fg) = _statusColors(st);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(MC.rMd), border: Border.all(color: MC.border)),
      child: Row(children: [
        Text('×${formatQty(it['quantity'])}', style: MT.money.copyWith(color: MC.textSecondary)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${it['name'] ?? it['product_name'] ?? ''}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
            if (it['takeaway'] == true) Padding(padding: const EdgeInsets.only(top: 2), child: Pill(t('takeaway'), bg: MC.teal50, fg: MC.teal700)),
            Text(sub, style: MT.small),
          ]),
        ),
        if (st != null) Pill(tStatus(st), bg: bg, fg: fg, icon: st == 'ready' ? Icons.check_circle : (st == 'cooking' ? Icons.local_fire_department_outlined : null)),
        if (manage) ...[
          IconButton(onPressed: () => _requirePin(() => _moveItem(it)), icon: const Icon(Icons.subdirectory_arrow_right, size: 20), tooltip: t('move_item')),
          IconButton(onPressed: () => _requirePin(() => _removeItem(it)), icon: const Icon(Icons.delete_outline, size: 20, color: MC.red500), tooltip: t('delete_dish')),
        ],
      ]),
    );
  }
}
