import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../theme/tokens.dart';
import '../../ui/dialogs.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import '../floor/floor_view.dart';

/// Callbacks the cashier wires into the payment screen (port of PaymentModal props).
class PaymentActions {
  PaymentActions({
    required this.print,
    required this.complete,
    this.cancel,
    this.reassign,
    this.addItems,
    this.setWaiter,
    this.setItemWaiter,
    this.removeItems,
    this.applyDiscount,
    this.refresh,
  });

  final Future<void> Function(Json order) print;
  final Future<void> Function(Json order, String method, Map<String, dynamic>? detail) complete;
  final void Function(Json order)? cancel;
  final void Function(Json order)? reassign;
  final void Function(Json order)? addItems;
  final Future<void> Function(Json order, String? waiterId)? setWaiter;
  final Future<void> Function(Json order, Json item, String waiterId)? setItemWaiter;
  final void Function(Json order, List<String> itemIds, VoidCallback onDone)? removeItems;
  final Future<void> Function(Json order, num amount)? applyDiscount;
  final Future<Json?> Function(Json order)? refresh;
}

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.order, required this.staff, required this.actions, this.canClose = true});
  final Json order;
  final List<Json> staff;
  final PaymentActions actions;
  final bool canClose;

  @override
  State<PaymentScreen> createState() => PaymentScreenState();
}

class PaymentScreenState extends State<PaymentScreen> {
  late Json order = widget.order;
  String method = 'cash';
  final _cash = TextEditingController();
  final _card = TextEditingController();
  final _disc = TextEditingController();
  final _debtName = TextEditingController();
  final _debtPhone = TextEditingController(text: '+998');
  String act = '';
  bool busy = false;
  bool printed = false;
  bool selecting = false;
  bool debt = false;
  final Set<String> selected = {};
  Timer? _refreshTimer;

  /// Called by the cashier after it changed the order elsewhere (add items, waiter, discount...).
  void setOrder(Json o) {
    if (mounted) setState(() => order = o);
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    for (final c in [_cash, _card, _disc, _debtName, _debtPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  double get total => toNum(order['total_amount']).toDouble();
  List<Json> get items => asJsonList(order['items']).where((i) => i['status'] != 'cancelled').toList();
  double get subtotal => items.fold(0.0, (s, i) => s + toNum(i['total'] ?? toNum(i['price']) * toNum(i['quantity'])));
  double get cashNum => double.tryParse(_cash.text.replaceAll(',', '.')) ?? 0;
  double get cardNum => double.tryParse(_card.text.replaceAll(',', '.')) ?? 0;
  bool get anyEntered => _cash.text.isNotEmpty || _card.text.isNotEmpty;
  double get paid => cashNum + cardNum;
  double get change => (paid - total).clamp(0, double.infinity);
  double get remaining => (total - paid).clamp(0, double.infinity);

  void _scheduleRefresh() {
    _refreshTimer?.cancel();
    if (widget.actions.refresh == null || !anyEntered) return;
    _refreshTimer = Timer(const Duration(milliseconds: 600), () async {
      final fresh = await widget.actions.refresh!(order);
      if (fresh != null && mounted) setState(() => order = fresh);
    });
  }

  Future<void> _run(String name, Future<void> Function() fn) async {
    if (act.isNotEmpty || busy) return;
    setState(() => act = name);
    try {
      await fn();
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => act = '');
    }
  }

  Future<void> _print() => _run('print', () async {
        await widget.actions.print(order);
        if (!mounted) return;
        setState(() => printed = true);
        Future.delayed(const Duration(milliseconds: 1600), () => mounted ? setState(() => printed = false) : null);
      });

  Future<void> _applyDiscount(num pct) => _run('discount', () async {
        await widget.actions.applyDiscount!(order, (subtotal * pct / 100).round());
      });

  Future<void> _complete() async {
    if (busy) return;
    if (anyEntered && remaining > 0) {
      setState(() => debt = true);
      return;
    }
    setState(() => busy = true);
    var pay = method;
    Map<String, dynamic>? detail;
    if (anyEntered) {
      final parts = <String, dynamic>{if (cashNum > 0) 'cash': cashNum, if (cardNum > 0) 'card': cardNum};
      pay = cashNum > 0 && cardNum > 0 ? 'mixed' : (cardNum > 0 ? 'card' : 'cash');
      detail = parts.isEmpty ? null : parts;
    }
    try {
      await widget.actions.complete(order, pay, detail);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _debtComplete() async {
    if (busy) return;
    setState(() => busy = true);
    final detail = <String, dynamic>{
      'cash': cashNum,
      if (cardNum > 0) 'card': cardNum,
      'debt': remaining,
      if (_debtName.text.trim().isNotEmpty) 'client_name': _debtName.text.trim(),
      if (fullPhone(_debtPhone.text).isNotEmpty) 'client_phone': fullPhone(_debtPhone.text),
    };
    try {
      await widget.actions.complete(order, 'debt', detail);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.actions;
    final title = '${debt ? t('debt_title') : t('pay_order')} #${order['order_number'] ?? ''}';
    return PopScope(
      canPop: !debt,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && debt) setState(() => debt = false);
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => debt ? setState(() => debt = false) : Navigator.pop(context)),
          titleSpacing: 0,
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: MT.title),
            if (order['table_number'] != null) Text('${t('table')} ${order['table_number']}', style: MT.small.copyWith(fontSize: 12.5)),
          ]),
          actions: [
            if (!debt && (a.reassign != null || a.cancel != null))
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert),
                onSelected: (v) => v == 'move' ? a.reassign!(order) : a.cancel!(order),
                itemBuilder: (_) => [
                  if (a.reassign != null && order['table_number'] != null) PopupMenuItem(value: 'move', child: Row(children: [const Icon(Icons.swap_horiz, size: 20), const SizedBox(width: 10), Text(t('move_table'))])),
                  if (a.cancel != null) PopupMenuItem(value: 'cancel', child: Row(children: [const Icon(Icons.block, size: 20, color: MC.red500), const SizedBox(width: 10), Text(t('cancel_order'), style: const TextStyle(color: MC.red600))])),
                ],
              ),
          ],
          bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Container(height: 1, color: MC.border)),
        ),
        body: debt ? _debtBody() : _mainBody(a),
        bottomNavigationBar: _actionBar(a),
      ),
    );
  }

  Widget _debtBody() => ListView(padding: const EdgeInsets.all(16), children: [
        _kv(t('to_pay_label'), fmtMoney(total), bold: true),
        _kv(t('cash_received'), fmtMoney(cashNum)),
        if (cardNum > 0) _kv(t('card'), fmtMoney(cardNum)),
        _kv(t('debt_left'), fmtMoney(remaining), color: MC.red600, bold: true),
        const SizedBox(height: 16),
        Labeled(t('debt_client'), TextField(controller: _debtName, decoration: InputDecoration(hintText: t('debt_client_ph')))),
        const SizedBox(height: 12),
        Labeled(t('debt_phone'), TextField(controller: _debtPhone, keyboardType: TextInputType.phone, inputFormatters: [PhoneInputFormatter()])),
      ]);

  Widget _kv(String k, String v, {bool bold = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k, style: MT.body.copyWith(color: color ?? MC.textSecondary)),
          Text(v, style: MT.title.copyWith(fontSize: bold ? 18 : 16, color: color ?? MC.textPrimary)),
        ]),
      );

  Widget _mainBody(PaymentActions a) {
    final creator = staffName(widget.staff, order['waiter_id'], fallback: '${order['waiter_name'] ?? '—'}');
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
      // meta
      Wrap(spacing: 14, runSpacing: 6, children: [
        _meta(Icons.person_outline, creator),
        if (order['created_at'] != null) _meta(Icons.schedule, fmtTime(order['created_at'])),
        if (order['customer_phone'] != null) _meta(Icons.phone_outlined, formatPhone(extractPhoneDigits('${order['customer_phone']}'))),
        if (order['customer_address'] != null) _meta(Icons.place_outlined, '${order['customer_address']}'),
      ]),
      const SizedBox(height: 12),
      // items
      if (a.removeItems != null && items.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: selecting
              ? Row(children: [
                  Expanded(child: Text('${t('dishes_selected')}: ${selected.length}', style: MT.label)),
                  TextButton(onPressed: () => setState(() {
                        selecting = false;
                        selected.clear();
                      }), child: Text(t('cancel'))),
                  TextButton(
                    onPressed: selected.isEmpty
                        ? null
                        : () => a.removeItems!(order, selected.toList(), () => setState(() {
                              selecting = false;
                              selected.clear();
                            })),
                    child: Text(t('cancel_selected_dishes'), style: TextStyle(color: selected.isEmpty ? MC.n300 : MC.red600)),
                  ),
                ])
              : Align(alignment: Alignment.centerLeft, child: GhostButton(label: t('select_dishes_to_cancel'), onPressed: () => setState(() => selecting = true), height: 42)),
        ),
      if (items.isEmpty) Text('${t('order_items')}: —', style: MT.bodyMuted),
      for (final it in items) _itemRow(a, it),
      const SizedBox(height: 14),
      // totals
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: MC.brandSubtle, borderRadius: BorderRadius.circular(MC.rLg), border: Border.all(color: MC.teal100)),
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(t('to_pay_label'), style: MT.title),
            Text(fmtMoney(total), style: MT.h1.copyWith(color: MC.teal600, fontSize: 24)),
          ]),
          if (toNum(order['discount_amount']) > 0) _kv(t('discount_word'), '−${fmtMoney(toNum(order['discount_amount']))}', color: MC.green600),
        ]),
      ),
      const SizedBox(height: 12),
      if (a.applyDiscount != null)
        Row(children: [
          const Icon(Icons.percent, size: 18, color: MC.n600),
          const SizedBox(width: 8),
          Text(t('discount_word'), style: MT.label),
          const Spacer(),
          SizedBox(
            width: 110,
            child: TextField(
              controller: _disc,
              enabled: act != 'discount',
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(hintText: '0', isDense: true, suffixText: '%'),
              onSubmitted: (v) {
                final p = (int.tryParse(v) ?? 0).clamp(0, 100);
                _disc.text = p == 0 ? '' : '$p';
                _applyDiscount(p);
              },
              onTapOutside: (_) {
                final p = (int.tryParse(_disc.text) ?? 0).clamp(0, 100);
                if (_disc.text.isNotEmpty) _applyDiscount(p);
                FocusScope.of(context).unfocus();
              },
            ),
          ),
        ]),
      if (a.setWaiter != null && widget.staff.isNotEmpty) ...[
        const SizedBox(height: 10),
        _waiterButton(t('change_waiter'), order['waiter_id'], act == 'waiter', (id) => _run('waiter', () => a.setWaiter!(order, id))),
      ],
      const SizedBox(height: 12),
      GhostButton(
        label: t('print_receipt'),
        icon: printed ? Icons.check_circle : Icons.print_outlined,
        onPressed: act == 'print' ? null : _print,
      ),
      const SizedBox(height: 14),
      Row(children: [
        Expanded(child: _methodBtn('cash', Icons.payments_outlined, t('cash'))),
        const SizedBox(width: 10),
        Expanded(child: _methodBtn('card', Icons.credit_card, t('card'))),
      ]),
      const SizedBox(height: 12),
      if (method == 'cash') ...[
        Text(t('cash_received'), style: MT.label),
        const SizedBox(height: 6),
        TextField(controller: _cash, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(hintText: '${(total - cardNum).clamp(0, double.infinity).round()}'), onChanged: (_) {
          setState(() {});
          _scheduleRefresh();
        }),
      ] else ...[
        Text(t('card_amount'), style: MT.label),
        const SizedBox(height: 6),
        TextField(controller: _card, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(hintText: '${(total - cashNum).clamp(0, double.infinity).round()}'), onChanged: (_) {
          setState(() {});
          _scheduleRefresh();
        }),
        Padding(padding: const EdgeInsets.only(top: 6), child: Text(t('card_hint'), style: MT.small)),
      ],
      if (anyEntered) ...[
        const SizedBox(height: 10),
        if (cashNum > 0) _kv(t('cash'), fmtMoney(cashNum)),
        if (cardNum > 0) _kv(t('card'), fmtMoney(cardNum)),
        if (change > 0) _kv(t('change'), fmtMoney(change)),
        if (remaining > 0) _kv(t('not_enough'), fmtMoney(remaining), color: MC.red600, bold: true),
      ],
    ]);
  }

  Widget _meta(IconData i, String s) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(i, size: 15, color: MC.n500), const SizedBox(width: 4), Text(s, style: MT.small.copyWith(fontSize: 13))]);

  Widget _methodBtn(String m, IconData icon, String label) {
    final on = method == m;
    return Material(
      color: on ? MC.teal500 : MC.card,
      borderRadius: BorderRadius.circular(MC.rLg),
      child: InkWell(
        borderRadius: BorderRadius.circular(MC.rLg),
        onTap: () => setState(() => method = m),
        child: Container(
          height: 64,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(MC.rLg), border: Border.all(color: on ? MC.teal500 : MC.border)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: on ? Colors.white : MC.n600, size: 26),
            const SizedBox(width: 10),
            Text(label, style: MT.button.copyWith(fontSize: 16, color: on ? Colors.white : MC.textPrimary)),
          ]),
        ),
      ),
    );
  }

  Widget _waiterButton(String label, dynamic value, bool loading, Future<void> Function(String id) onPick) => OutlinedButton(
        onPressed: loading
            ? null
            : () async {
                final id = await pickStaff(context, staff: widget.staff, current: '${value ?? ''}', title: label);
                if (id != null && id != '${value ?? ''}') await onPick(id);
              },
        child: Row(children: [
          const Icon(Icons.person_outline, size: 18, color: MC.teal600),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: MT.label.copyWith(color: MC.textSecondary))),
          Text(staffName(widget.staff, value, fallback: t('waiter_not_set')), style: MT.label.copyWith(color: MC.textPrimary)),
          const Icon(Icons.expand_more, size: 18),
        ]),
      );

  Widget _itemRow(PaymentActions a, Json it) {
    final id = '${it['id']}';
    final on = selected.contains(id);
    final added = [if (it['created_at'] != null) fmtTime(it['created_at']), if ((it['added_by_name'] ?? it['waiter_name']) != null) '${it['added_by_name'] ?? it['waiter_name']}'].join(' · ');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: on ? MC.red100.withValues(alpha: 0.5) : MC.card,
        borderRadius: BorderRadius.circular(MC.rMd),
        border: Border.all(color: on ? MC.red500 : MC.border),
      ),
      child: Column(children: [
        InkWell(
          onTap: selecting ? () => setState(() => on ? selected.remove(id) : selected.add(id)) : null,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (selecting) Padding(padding: const EdgeInsets.only(right: 10), child: Icon(on ? Icons.check_circle : Icons.radio_button_unchecked, color: on ? MC.red500 : MC.n300)),
            Text('${formatQty(it['quantity'])}×', style: MT.money.copyWith(color: MC.textSecondary)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${it['name'] ?? it['product_name'] ?? ''}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                if (it['takeaway'] == true) Padding(padding: const EdgeInsets.only(top: 2), child: Pill(t('takeaway'), bg: MC.teal50, fg: MC.teal700)),
                if (added.isNotEmpty) Text(added, style: MT.small),
              ]),
            ),
            Text(fmtMoney(toNum(it['total'] ?? toNum(it['price']) * toNum(it['quantity']))), style: MT.money.copyWith(color: MC.textPrimary)),
          ]),
        ),
        if (a.setItemWaiter != null && widget.staff.isNotEmpty && !selecting)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: _waiterButton(t('change_item_waiter'), it['added_by'], act == 'item-waiter-$id', (w) => _run('item-waiter-$id', () => a.setItemWaiter!(order, it, w))),
          ),
      ]),
    );
  }

  Widget _actionBar(PaymentActions a) => SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(color: MC.card, border: Border(top: BorderSide(color: MC.border))),
          child: debt
              ? BusyButton(label: t('debt_close'), icon: Icons.check_circle_outline, busy: busy, onPressed: _debtComplete)
              : Row(children: [
                  if (a.addItems != null) ...[
                    SizedBox(width: 56, height: 52, child: OutlinedButton(style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(56, 52)), onPressed: () => a.addItems!(order), child: const Icon(Icons.add, color: MC.teal600))),
                    const SizedBox(width: 10),
                  ],
                  Expanded(child: BusyButton(label: t('complete_order'), icon: Icons.check_circle_outline, busy: busy, onPressed: widget.canClose ? _complete : null)),
                ]),
        ),
      );
}
