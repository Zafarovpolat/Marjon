import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';

// Backend state machine: new -> (accepted | cooking) -> ready -> completed; cancelled is reachable until ready.
const _statuses = {
  'all': 'Все',
  'new': 'Новые',
  'accepted': 'Приняты',
  'cooking': 'Готовятся',
  'ready': 'Готовы',
  'completed': 'Закрыты',
  'cancelled': 'Отменены',
};
const _statusName = {'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится', 'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён'};
const _nextSteps = {
  'new': ['accepted', 'cooking', 'cancelled'],
  'accepted': ['cooking', 'cancelled'],
  'cooking': ['ready', 'cancelled'],
  'ready': ['completed', 'cancelled'],
};
const _stepLabel = {'accepted': 'Принять', 'cooking': 'На кухню', 'ready': 'Готов', 'completed': 'Закрыть заказ', 'cancelled': 'Отмена'};
const _stepIcon = {'accepted': Icons.thumb_up_outlined, 'cooking': Icons.soup_kitchen_outlined, 'ready': Icons.check, 'completed': Icons.task_alt, 'cancelled': Icons.close};
const _typeName = {'dine_in': 'В зале', 'takeaway': 'С собой', 'delivery': 'Доставка'};

Pill _statusPill(String s) {
  switch (s) {
    case 'cancelled':
      return Pill(_statusName[s] ?? s, bg: MC.red100, fg: MC.red600);
    case 'completed':
      return Pill(_statusName[s] ?? s, bg: MC.green100, fg: MC.green600);
    case 'ready':
      return Pill(_statusName[s] ?? s, bg: MC.teal50, fg: MC.teal700);
    case 'new':
    case 'accepted':
    case 'cooking':
      return Pill(_statusName[s] ?? s, bg: MC.amber100, fg: MC.amber700);
    default:
      return Pill(_statusName[s] ?? s);
  }
}

/// Orders of a day with status filter and order details.
class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  DateTime day = DateTime.now();
  String status = 'all';

  Future<void> _pick() async {
    final p = await showDatePicker(context: context, initialDate: day, firstDate: DateTime(2023), lastDate: DateTime.now());
    if (p != null) setState(() => day = p);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Заказы'), actions: [TextButton.icon(onPressed: _pick, icon: const Icon(Icons.calendar_today, size: 16), label: Text(fmtDate(day)))]),
        body: Column(children: [
          ChipTabs(items: _statuses, value: status, onChanged: (v) => setState(() => status = v)),
          Expanded(
            child: AsyncBody<List<Json>>(
              reloadKey: '${isoDate(day)}$status',
              load: () async => asJsonList(await Api.i.get('/pos/orders', query: {'date': isoDate(day), if (status != 'all') 'status': status})),
              builder: (_, rows, reload) {
                final total = rows.where((o) => o['status'] != 'cancelled').fold<num>(0, (s, o) => s + toNum(o['total_amount']));
                return RefreshIndicator(
                  onRefresh: reload,
                  child: rows.isEmpty
                      ? ListView(children: const [SizedBox(height: 300, child: EmptyState('Заказов за этот день нет', icon: Icons.receipt_long_outlined))])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          itemCount: rows.length + 1,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            if (i == 0) return Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${rows.length} заказов · ${fmtMoney(total)}', style: MT.label));
                            final o = rows[i - 1];
                            return Card2(
                              onTap: () => push(context, OrderDetailPage(order: o)),
                              child: Row(children: [
                                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('#${o['order_number']}', style: MT.money.copyWith(fontSize: 16, color: MC.textPrimary)),
                                  const SizedBox(height: 4),
                                  Text(fmtTime(o['created_at']), style: MT.small),
                                ]),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(o['table_number'] != null ? 'Стол ${o['table_number']}' : (_typeName['${o['order_type']}'] ?? '${o['order_type']}'), style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                    if (o['waiter_name'] != null) Text('${o['waiter_name']}', style: MT.small),
                                  ]),
                                ),
                                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  Text(fmtMoney(toNum(o['total_amount'])), style: MT.money),
                                  const SizedBox(height: 4),
                                  _statusPill('${o['status']}'),
                                ]),
                              ]),
                            );
                          },
                        ),
                );
              },
            ),
          ),
        ]),
      );
}

class OrderDetailPage extends StatefulWidget {
  const OrderDetailPage({super.key, required this.order});
  final Json order;
  @override
  State<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<OrderDetailPage> {
  int gen = 0;
  bool busy = false;
  bool printingReceipt = false;
  bool printingKitchen = false;
  Json get order => widget.order;

  Future<void> _print({required bool kitchen}) async {
    if (printingReceipt || printingKitchen) return;
    setState(() => kitchen ? printingKitchen = true : printingReceipt = true);
    try {
      await Api.i.post('/printers/print/orders/${order['id']}/${kitchen ? 'kitchen' : 'receipt'}');
      if (mounted) toast(context, kitchen ? 'Кухонный талон отправлен на печать' : 'Чек отправлен на печать');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => kitchen ? printingKitchen = false : printingReceipt = false);
    }
  }

  Future<void> _setStatus(String status) async {
    if (busy) return;
    if (status == 'cancelled' && !await confirm(context, 'Отменить заказ #${order['order_number']}?', action: 'Отменить')) return;
    setState(() => busy = true);
    try {
      await Api.i.patch('/pos/orders/${order['id']}/status', data: {'status': status});
      if (mounted) setState(() => gen++);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Заказ #${order['order_number']}'), actions: [
          printingReceipt
              ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
              : IconBtn(icon: Icons.receipt_long_outlined, tooltip: 'Печать чека', onTap: () => _print(kitchen: false)),
          printingKitchen
              ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
              : IconBtn(icon: Icons.soup_kitchen_outlined, tooltip: 'Печать талона на кухню', onTap: () => _print(kitchen: true)),
        ]),
        body: AsyncBody<Json>(
          reloadKey: gen,
          load: () async => asJson(await Api.i.get('/pos/orders/${order['id']}')),
          builder: (_, o, __) {
            final items = asJsonList(o['items']);
            return ListView(padding: const EdgeInsets.all(16), children: [
              Row(children: [_statusPill('${o['status']}'), const Spacer(), Text(fmtDateTime(o['created_at']), style: MT.small)]),
              const SizedBox(height: 12),
              Card2(child: Column(children: [
                KV('Тип', _typeName['${o['order_type']}'] ?? '${o['order_type']}'),
                if (o['table_number'] != null) KV('Стол', '${o['table_number']}'),
                if (o['waiter_name'] != null) KV('Официант', '${o['waiter_name']}'),
                if (o['customer_phone'] != null) KV('Телефон', '${o['customer_phone']}'),
                if (o['customer_address'] != null) KV('Адрес', '${o['customer_address']}'),
                if (o['note'] != null) KV('Комментарий', '${o['note']}'),
                if (o['cancel_comment'] != null) KV('Причина отмены', '${o['cancel_comment']}', color: MC.red600),
              ])),
              if (_nextSteps['${o['status']}'] != null) ...[
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final step in _nextSteps['${o['status']}']!)
                    SizedBox(
                      width: 160,
                      child: GhostButton(label: _stepLabel[step]!, icon: _stepIcon[step], onPressed: busy ? null : () => _setStatus(step)),
                    ),
                ]),
              ],
              const SectionLabel('Позиции'),
              Card2(child: Column(children: [
                for (final it in items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [
                      Expanded(child: Text('${it['name']}', style: MT.body.copyWith(decoration: it['cancelled_at'] != null ? TextDecoration.lineThrough : null))),
                      Text('×${fmtNum(toNum(it['quantity']))}', style: MT.small),
                      const SizedBox(width: 12),
                      Text(fmtMoney(toNum(it['total'])), style: MT.money),
                    ]),
                  ),
              ])),
              const SizedBox(height: 12),
              Card2(child: Column(children: [
                KV('Подытог', fmtMoney(toNum(o['subtotal']))),
                if (toNum(o['discount_amount']) > 0) KV('Скидка', '−${fmtMoney(toNum(o['discount_amount']))}'),
                if (toNum(o['service_fee']) > 0) KV('Обслуживание', fmtMoney(toNum(o['service_fee']))),
                if (toNum(o['tax_amount']) > 0) KV('Налог', fmtMoney(toNum(o['tax_amount']))),
                const Divider(),
                KV('Итого', fmtMoney(toNum(o['total_amount'])), bold: true, color: MC.teal600),
              ])),
            ]);
          },
        ),
      );
}
