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
import '../panels/panels.dart';
import '../workspace/mode_host.dart';
import 'payment_screen.dart';

/// Cashier (and courier = trimmed cashier): tables / boards, payment, new orders.
class CashierMode extends StatefulWidget {
  const CashierMode({super.key, required this.session, this.courier = false});
  final Session session;
  final bool courier;

  @override
  State<CashierMode> createState() => _CashierModeState();
}

class _CashierModeState extends State<CashierMode> {
  late final FloorData floor = FloorData(widget.session.branchId);
  late String zone = widget.courier ? 'delivery' : 'all';
  List<Json> staff = [];
  Map<String, Json> printers = {};

  Json? get user => widget.session.staffUser;
  String get branchId => widget.session.branchId;

  @override
  void initState() {
    super.initState();
    floor.addListener(_rebuild);
    _loadStaff();
    _loadPrinters();
    WidgetsBinding.instance.addPostFrameCallback((_) => _registerMenu());
  }

  late ModeHostController _host;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _host = ModeHost.of(context);
  }

  @override
  void dispose() {
    floor.removeListener(_rebuild);
    floor.dispose();
    _host.setItems(const []);
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  void _registerMenu() {
    if (widget.courier || !mounted) return;
    ModeHost.of(context).setItems(buildPanelMenu(context, widget.session, floor: floor));
  }

  Future<void> _loadStaff() async {
    try {
      final d = await Api.i.branchColleagues();
      const hidden = {'owner', 'manager', 'warehouse'};
      String role(Json u) => '${u['role_slug'] ?? ((u['role_slugs'] as List?)?.firstOrNull ?? '')}'.toLowerCase();
      final list = asJsonList(d).where((u) => u['is_active'] != false && !hidden.contains(role(u))).toList();
      final indexed = list.asMap().entries.toList()
        ..sort((a, b) {
          final c = (role(b.value) == 'cashier' ? 1 : 0) - (role(a.value) == 'cashier' ? 1 : 0);
          return c != 0 ? c : a.key - b.key;
        });
      if (mounted) setState(() => staff = indexed.map((e) => e.value).toList());
    } catch (_) {}
  }

  Future<void> _loadPrinters() async {
    try {
      final l = asJsonList(await Api.i.printers());
      if (mounted) setState(() => printers = {for (final p in l) '${p['id']}': p});
    } catch (_) {}
  }

  Json? get _receiptPrinter {
    for (final p in printers.values) {
      if (p['printer_type'] == 'receipt' && '${p['branch_id']}' == branchId) return p;
    }
    return null;
  }

  // ── orders ───────────────────────────────────────────────────────────────

  Future<void> _openBuilder(String type, Json? table, {String? addToOrderId}) async {
    final courier = widget.courier;
    final title = addToOrderId != null || type == 'dine_in' ? (table?['number'] != null ? '${t('table')} ${table!['number']}' : t('dine_in')) : t(type);
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => OrderBuilderScreen(
        title: title,
        orderType: type,
        courier: courier,
        canTakeaway: type != 'dine_in' || Perm.can(user, 'can_takeaway_at_table'),
        canDeleteLines: Perm.can(user, 'can_delete_dishes'),
        submitLabel: addToOrderId != null ? t('add_dishes') : t('create_order'),
        onSubmit: (o) async {
          if (addToOrderId != null) {
            for (final l in o.lines) {
              await Api.i.addItem(addToOrderId, l.toItemJson());
            }
          } else {
            await Api.i.createOrder({
              'branch_id': branchId,
              'order_type': type,
              if (type == 'dine_in' && table?['number'] != null) 'table_number': '${table!['number']}',
              if (o.note.isNotEmpty) 'note': o.note,
              if (o.customerId != null) 'customer_id': o.customerId,
              if (type == 'delivery' && fullPhone(o.phone).isNotEmpty) 'customer_phone': fullPhone(o.phone),
              if (type == 'delivery' && o.address.isNotEmpty) 'customer_address': o.address,
              'items': [for (final l in o.lines) l.toItemJson(forceTakeaway: courier)],
            });
          }
        },
      ),
    ));
    if (ok == true) {
      if (!mounted) return;
      toast(context, t('order_created'));
      if (addToOrderId == null) {
        if (courier) {
          setState(() => zone = 'delivery');
        } else if (type == 'delivery' || type == 'takeaway') {
          setState(() => zone = type);
        } else if (type == 'dine_in' && table?['number'] == null) {
          // No table picked — the order only shows in the "no table" board.
          setState(() => zone = 'no_table');
        }
      }
      floor.load();
    }
  }

  void _tapTable(Json tb) {
    final o = floor.orderFor(tb['number']);
    if (o != null) {
      _openPayment(o);
    } else {
      _openBuilder('dine_in', tb);
    }
  }

  final _payKey = GlobalKey<PaymentScreenState>();

  Future<void> _openPayment(Json order) async {
    final u = user;
    final a = PaymentActions(
      print: _printReceipt,
      complete: _complete,
      cancel: _cancelOrder,
      reassign: _reassign,
      addItems: _addDishes,
      setWaiter: _setOrderWaiter,
      setItemWaiter: _setItemWaiter,
      removeItems: Perm.must(u, 'can_manage_orders') ? _removeItems : null,
      applyDiscount: _applyDiscount,
      refresh: (o) async {
        try {
          return await Api.i.order('${o['id']}');
        } catch (_) {
          return null;
        }
      },
    );
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PaymentScreen(key: _payKey, order: order, staff: staff, actions: a, canClose: Perm.can(u, 'can_close_bill')),
    ));
    floor.load();
  }

  void _setPay(Json o) => _payKey.currentState?.setOrder(o);

  Future<void> _printReceipt(Json order) async {
    final pr = _receiptPrinter;
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

  Future<void> _complete(Json order, String method, Map<String, dynamic>? detail) async {
    try {
      await Api.i.completeOrder('${order['id']}');
      if (method == 'debt' && detail != null && toNum(detail['cash']) > 0) {
        final comment = 'Долг: заказ #${order['order_number'] ?? ''}, получено ${fmtNum(toNum(detail['cash']))}, остаток ${fmtNum(toNum(detail['debt']))}'
            '${detail['client_name'] != null ? ', клиент: ${detail['client_name']}' : ''}${detail['client_phone'] != null ? ', тел: ${detail['client_phone']}' : ''}';
        try {
          await Api.i.addCashFlow({'amount': toNum(detail['cash']), 'direction': 'income', 'comment': comment});
        } catch (_) {}
      }
      if (mounted) {
        toast(context, t('order_closed'));
        Navigator.of(context).maybePop();
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, '${t('close_order_error')}: ${e.message}', error: true);
    }
    floor.load();
  }

  void _cancelOrder(Json order) => showPrompt(
        context,
        title: t('cancel_order'),
        hint: t('cancel_password_prompt'),
        password: true,
        extra: (label: t('cancel_comment'), placeholder: t('cancel_comment_ph')),
        submitLabel: t('cancel_order'),
        onSubmit: (pwd, comment) async {
          await Api.i.cancelOrder('${order['id']}', password: pwd, comment: comment);
          if (mounted) Navigator.of(context).maybePop();
          floor.load();
        },
      );

  void _reassign(Json order) => showPrompt(
        context,
        title: t('move_table'),
        hint: t('move_to_table'),
        options: [for (final tb in floor.allTables) PromptOption('${tb['number']}', '${t('table')} ${tb['number']}')],
        initial: '${order['table_number'] ?? ''}',
        extra: (label: t('move_reason'), placeholder: t('move_reason_ph')),
        submitLabel: t('save'),
        onSubmit: (tbl, reason) async {
          await Api.i.updateOrder('${order['id']}', {'table_number': tbl, if (reason.isNotEmpty) 'reason': reason});
          if (mounted) Navigator.of(context).maybePop();
          floor.load();
        },
      );

  Future<void> _addDishes(Json order) async {
    await _openBuilder('dine_in', {'number': order['table_number']}, addToOrderId: '${order['id']}');
    try {
      _setPay(await Api.i.order('${order['id']}'));
    } catch (_) {}
  }

  Future<void> _setOrderWaiter(Json order, String? waiterId) async {
    await Api.i.updateOrder('${order['id']}', {'waiter_id': waiterId});
    _setPay({...order, 'waiter_id': waiterId});
    floor.load();
  }

  Future<void> _setItemWaiter(Json order, Json item, String waiterId) async {
    _setPay(Map<String, dynamic>.from(await Api.i.setItemWaiter('${order['id']}', '${item['id']}', waiterId)));
    floor.load();
  }

  void _removeItems(Json order, List<String> ids, VoidCallback done) => showPrompt(
        context,
        title: t('cancel_selected_dishes'),
        hint: t('delete_reason'),
        placeholder: t('delete_reason_ph'),
        submitLabel: t('cancel_selected_dishes'),
        onSubmit: (reason, _) async {
          Json updated = order;
          for (final id in ids) {
            updated = Map<String, dynamic>.from(await Api.i.removeItem('${order['id']}', id, reason: reason));
            _setPay(updated);
          }
          done();
          floor.load();
        },
      );

  Future<void> _applyDiscount(Json order, num amount) async {
    _setPay(await Api.i.updateOrder('${order['id']}', {'discount_amount': amount}));
    floor.load();
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = widget.courier;
    final board = (zone == 'delivery' || zone == 'takeaway' || zone == 'no_table') ? zone : null;
    final showTypes = !c && Perm.can(user, 'can_change_order_type');

    final actions = <Widget>[
      if (board != null && !c)
        IconButton(onPressed: () => setState(() => zone = 'all'), icon: const Icon(Icons.arrow_back), tooltip: t('to_tables')),
      if (board != null)
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: MC.teal500, minimumSize: const Size(0, 42), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rMd))),
          onPressed: () => _openBuilder(board == 'no_table' ? 'dine_in' : board, null),
          icon: const Icon(Icons.add, size: 18),
          label: Text(t('new_order')),
        ),
      if (board == null && showTypes) ...[
        IconButton.outlined(onPressed: () => setState(() => zone = 'takeaway'), icon: const Icon(Icons.shopping_bag_outlined), tooltip: t('takeaway')),
        const SizedBox(width: 4),
        IconButton.outlined(onPressed: () => setState(() => zone = 'delivery'), icon: const Icon(Icons.two_wheeler), tooltip: t('delivery')),
        const SizedBox(width: 4),
      ],
      if (board == null && !c)
        IconButton.outlined(onPressed: () => setState(() => zone = 'no_table'), icon: const Icon(Icons.receipt_long_outlined), tooltip: t('no_table')),
    ];

    return FloorView(
      floor: floor,
      activeZone: zone,
      onZone: (z) => setState(() => zone = z),
      onTable: _tapTable,
      showZoneChips: !c && board == null,
      board: board,
      actions: actions,
      onBoardOrder: c ? null : _openPayment,
    );
  }
}
