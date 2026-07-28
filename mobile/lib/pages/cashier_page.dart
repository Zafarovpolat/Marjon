import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../view_models/cashier_view_model.dart';
import '../widgets/common.dart';

class CashierPage extends StatefulWidget {
  const CashierPage({super.key});
  @override
  State<CashierPage> createState() => _CashierPageState();
}

class _CashierPageState extends State<CashierPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 5, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final branchId = context.read<AppState>().branchId;
      context.read<CashierViewModel>().start(branchId);
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _changeStatus(Map<String, dynamic> order, String newStatus) async {
    final vm = context.read<CashierViewModel>();
    final ok = await vm.changeStatus(order['id'] as String, newStatus);
    if (!mounted) return;
    if (ok) {
      showSnack(context, 'Заказ #${order['order_number']} → ${orderStatusLabel(newStatus)}');
    } else {
      showSnack(context, 'Ошибка обновления статуса', error: true);
    }
  }

  void _showPayment(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _PaymentSheet(
        order: order,
        onPaid: (change) {
          Navigator.pop(context);
          if (change != null && change > 0) {
            showDialog(
              context: context,
              builder: (_) => AlertDialog(
                backgroundColor: AppTheme.surface,
                title: const Text('Сдача'),
                content: Text(
                  '${fmtNum(change)} сум',
                  style: const TextStyle(
                    fontSize: 28, fontWeight: FontWeight.bold, color: AppTheme.accent)),
                actions: [
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Закрыть')),
                ],
              ),
            );
          } else {
            showSnack(context, 'Оплата принята ✓');
          }
        },
        onError: (msg) {
          Navigator.pop(context);
          showSnack(context, msg, error: true);
        },
      ),
    );
  }

  Future<void> _printReceipt(Map<String, dynamic> order) async {
    final vm = context.read<CashierViewModel>();
    if (vm.findReceiptPrinter() == null) {
      if (mounted) showSnack(context, 'Принтер чеков не найден', error: true);
      return;
    }
    final ok = await vm.printReceipt(order['id'] as String);
    if (!mounted) return;
    ok ? showSnack(context, 'Чек отправлен')
       : showSnack(context, 'Ошибка печати', error: true);
  }

  void _showOrderDetail(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _OrderDetailSheet(
        order: order,
        onStatusChange: (s) { Navigator.pop(context); _changeStatus(order, s); },
        onPayment: () { Navigator.pop(context); _showPayment(order); },
        onPrint: () { Navigator.pop(context); _printReceipt(order); },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final vm    = context.watch<CashierViewModel>();
    return Scaffold(
      appBar: AppBar(
        leading: state.isAdmin
          ? IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: state.backToModes)
          : null,
        title: Text('Касса — ${state.displayName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'Все (${vm.orders.length})'),
            Tab(text: 'Новые (${vm.filtered(1).length})'),
            Tab(text: 'Принятые (${vm.filtered(2).length})'),
            Tab(text: 'Готовятся (${vm.filtered(3).length})'),
            Tab(text: 'Готовы (${vm.filtered(4).length})'),
          ],
        ),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: vm.loading
          ? const LoadingCenter(key: ValueKey('loading'))
          : TabBarView(
              key: const ValueKey('tabs'),
              controller: _tabs,
              children: List.generate(5, (tabIdx) {
                final list = vm.filtered(tabIdx);
                if (list.isEmpty) {
                  return const EmptyState(
                    icon: Icons.receipt_long_outlined, message: 'Нет заказов');
                }
                return RefreshIndicator(
                  onRefresh: vm.load,
                  child: ListView.builder(
                    padding: EdgeInsets.fromLTRB(
                      10, 10, 10, MediaQuery.of(context).padding.bottom + 10),
                    itemCount: list.length,
                    itemBuilder: (ctx, i) => _buildSwipeCard(list[i]),
                  ),
                );
              }),
            ),
      ),
    );
  }

  Widget _buildSwipeCard(Map<String, dynamic> order) {
    final status   = order['status'] as String;
    final canRight = status == 'new' || status == 'ready';
    final canLeft  = status != 'completed' && status != 'cancelled';

    final DismissDirection dir;
    if (canRight && canLeft) {
      dir = DismissDirection.horizontal;
    } else if (canRight) {
      dir = DismissDirection.startToEnd;
    } else if (canLeft) {
      dir = DismissDirection.endToStart;
    } else {
      dir = DismissDirection.none;
    }

    return Dismissible(
      key: ValueKey('c_${order['id']}_$status'),
      direction: dir,
      background: canRight ? _swipeBgRight(status) : const SizedBox.shrink(),
      secondaryBackground: canLeft ? _swipeBgLeft() : const SizedBox.shrink(),
      confirmDismiss: (d) async {
        if (d == DismissDirection.startToEnd && canRight) {
          if (status == 'new') {
            await _changeStatus(order, 'accepted');
          } else {
            _showPayment(order);
          }
        } else if (d == DismissDirection.endToStart && canLeft) {
          if (!mounted) return false;
          final ok = await confirmDialog(
            context,
            title: 'Отменить #${order['order_number']}?',
            message: 'Это действие нельзя отменить');
          if (ok) await _changeStatus(order, 'cancelled');
        }
        return false;
      },
      child: _CashierOrderCard(
        order: order,
        onTap: () => _showOrderDetail(order),
        onStatusChange: _changeStatus,
        onPayment: () => _showPayment(order),
      ),
    );
  }

  Widget _swipeBgRight(String status) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    decoration: BoxDecoration(
      color: AppTheme.success, borderRadius: BorderRadius.circular(12)),
    alignment: Alignment.centerLeft,
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.check_circle_outline, color: Colors.white, size: 32),
      const SizedBox(height: 4),
      Text(status == 'new' ? 'Принять' : 'Закрыть',
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    ]),
  );

  Widget _swipeBgLeft() => Container(
    margin: const EdgeInsets.only(bottom: 10),
    decoration: BoxDecoration(
      color: AppTheme.danger, borderRadius: BorderRadius.circular(12)),
    alignment: Alignment.centerRight,
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: const Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.cancel_outlined, color: Colors.white, size: 32),
      SizedBox(height: 4),
      Text('Отменить', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    ]),
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────

class _CashierOrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final VoidCallback onTap;
  final Future<void> Function(Map<String, dynamic>, String) onStatusChange;
  final VoidCallback onPayment;
  const _CashierOrderCard({
    required this.order, required this.onTap,
    required this.onStatusChange, required this.onPayment});

  @override
  Widget build(BuildContext context) {
    final items  = order['items'] as List? ?? [];
    final status = order['status'] as String;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('#${order['order_number']}',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              if (order['table_number'] != null)
                Text('Стол ${order['table_number']}',
                  style: const TextStyle(color: AppTheme.textMuted)),
              const Spacer(),
              StatusBadge(status),
            ]),
            const SizedBox(height: 6),
            Text('${items.length} позиций',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            const SizedBox(height: 4),
            Text('${fmtNum(order['total_amount'])} сум',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            _actionButtons(status),
          ]),
        ),
      ),
    );
  }

  Widget _actionButtons(String status) {
    switch (status) {
      case 'new':
        return Row(children: [
          Expanded(child: ElevatedButton(
            onPressed: () => onStatusChange(order, 'accepted'),
            child: const Text('Принять'),
          )),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: () => onStatusChange(order, 'cancelled'),
            style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
            child: const Text('Отмена'),
          ),
        ]);
      case 'ready':
        return SizedBox(width: double.infinity, child: ElevatedButton.icon(
          icon: const Icon(Icons.check, size: 18),
          label: const Text('Закрыть заказ'),
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
          onPressed: onPayment,
        ));
      default:
        return const SizedBox.shrink();
    }
  }
}

// ── Order detail sheet ────────────────────────────────────────────────────────

class _OrderDetailSheet extends StatelessWidget {
  final Map<String, dynamic> order;
  final void Function(String) onStatusChange;
  final VoidCallback onPayment;
  final VoidCallback onPrint;
  const _OrderDetailSheet({
    required this.order, required this.onStatusChange,
    required this.onPayment, required this.onPrint});

  @override
  Widget build(BuildContext context) {
    final items  = order['items'] as List? ?? [];
    final status = order['status'] as String;
    return DraggableScrollableSheet(
      initialChildSize: 0.7, maxChildSize: 0.95, minChildSize: 0.4,
      expand: false,
      builder: (_, scrollCtrl) => ListView(
        controller: scrollCtrl,
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).padding.bottom + 20),
        children: [
          const DragHandle(),
          Row(children: [
            Text('Заказ #${order['order_number']}',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const Spacer(),
            StatusBadge(status),
          ]),
          if (order['table_number'] != null) ...[
            const SizedBox(height: 4),
            Text('Стол ${order['table_number']}',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 15)),
          ],
          if (order['note'] != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
              child: Text(order['note'],
                style: const TextStyle(color: AppTheme.warning)),
            ),
          ],
          const SizedBox(height: 16),
          const Text('Позиции',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ...items.map((item) => Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Text('×${item['quantity']}',
                style: const TextStyle(
                  fontWeight: FontWeight.bold, color: AppTheme.accent)),
              const SizedBox(width: 10),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['name'] as String,
                  style: const TextStyle(fontSize: 15)),
                if (item['note'] != null)
                  Text(item['note'] as String,
                    style: const TextStyle(
                      color: AppTheme.textMuted, fontSize: 12)),
              ])),
              Text('${fmtNum(item['total'])} сум',
                style: const TextStyle(color: AppTheme.textMuted)),
            ]),
          )),
          const Divider(height: 24),
          Row(children: [
            const Text('Подытог',
              style: TextStyle(color: AppTheme.textMuted)),
            const Spacer(),
            Text('${fmtNum(order['subtotal'])} сум'),
          ]),
          if (order['discount_amount'] != null &&
              order['discount_amount'] != '0.00') ...[
            const SizedBox(height: 4),
            Row(children: [
              const Text('Скидка', style: TextStyle(color: AppTheme.success)),
              const Spacer(),
              Text('-${fmtNum(order['discount_amount'])} сум',
                style: const TextStyle(color: AppTheme.success)),
            ]),
          ],
          const SizedBox(height: 8),
          Row(children: [
            const Text('Итого',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const Spacer(),
            Text('${fmtNum(order['total_amount'])} сум',
              style: const TextStyle(
                fontSize: 20, fontWeight: FontWeight.bold,
                color: AppTheme.accent)),
          ]),
          const SizedBox(height: 20),
          if (status == 'new') ...[
            SizedBox(width: double.infinity, child: ElevatedButton(
              onPressed: () => onStatusChange('accepted'),
              child: const Text('Принять заказ'),
            )),
            const SizedBox(height: 8),
            SizedBox(width: double.infinity, child: OutlinedButton(
              onPressed: () => onStatusChange('cancelled'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.danger),
              child: const Text('Отменить заказ'),
            )),
          ],
          if (status == 'ready') ...[
            SizedBox(width: double.infinity, child: ElevatedButton.icon(
              icon: const Icon(Icons.check),
              label: const Text('Закрыть заказ'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.success),
              onPressed: onPayment,
            )),
          ],
          const SizedBox(height: 8),
          SizedBox(width: double.infinity, child: OutlinedButton.icon(
            icon: const Icon(Icons.print, size: 18),
            label: const Text('Печать чека'),
            onPressed: onPrint,
          )),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

// ── Payment sheet ─────────────────────────────────────────────────────────────

class _PaymentSheet extends StatefulWidget {
  final Map<String, dynamic> order;
  final void Function(double? change) onPaid;
  final void Function(String msg) onError;
  const _PaymentSheet({
    required this.order, required this.onPaid, required this.onError});

  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  static const _methods = [
    ('cash',  'Наличные', Icons.payments_outlined),
    ('card',  'Карта',    Icons.credit_card_outlined),
    ('click', 'Click',    Icons.phone_android_outlined),
    ('payme', 'Payme',    Icons.phone_android_outlined),
    ('uzum',  'Uzum',     Icons.phone_android_outlined),
  ];

  String _method = 'cash';
  final _cashCtrl = TextEditingController();
  bool _loading = false;

  double get _total {
    final raw = widget.order['total_amount'];
    if (raw is num) return raw.toDouble();
    return double.tryParse(raw.toString()) ?? 0;
  }

  double? get _change {
    if (_method != 'cash') return null;
    final received = double.tryParse(_cashCtrl.text.replaceAll(' ', ''));
    if (received == null || received < _total) return null;
    return received - _total;
  }

  Future<void> _submit() async {
    if (_method == 'cash') {
      final received = double.tryParse(_cashCtrl.text.replaceAll(' ', ''));
      if (received == null || received < _total) {
        showSnack(context, 'Введите сумму не меньше ${fmtNum(_total)} сум', error: true);
        return;
      }
    }
    setState(() => _loading = true);
    try {
      final vm = context.read<CashierViewModel>();
      final result = await vm.processPayment(
        orderId: widget.order['id'] as String,
        amount: _total,
        method: _method,
        cashReceived: _method == 'cash'
            ? double.tryParse(_cashCtrl.text.replaceAll(' ', ''))
            : null,
      );
      final changeRaw = result['change_given'];
      final change = changeRaw == null ? null
          : (changeRaw is num ? changeRaw.toDouble()
              : double.tryParse(changeRaw.toString()));
      widget.onPaid(change);
    } catch (e) {
      widget.onError(e.toString());
    }
  }

  @override
  void dispose() {
    _cashCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const DragHandle(),
        const SizedBox(height: 8),
        Text('Оплата заказа #${widget.order['order_number']}',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text('Итого: ${fmtNum(_total)} сум',
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppTheme.accent)),
        const SizedBox(height: 20),
        const Text('Способ оплаты',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: _methods.map((m) {
          final selected = _method == m.$1;
          return ChoiceChip(
            avatar: Icon(m.$3, size: 16,
              color: selected ? Colors.white : AppTheme.textMuted),
            label: Text(m.$2),
            selected: selected,
            selectedColor: AppTheme.accent,
            labelStyle: TextStyle(
              color: selected ? Colors.white : AppTheme.textColor),
            onSelected: (_) => setState(() {
              _method = m.$1;
              _cashCtrl.clear();
            }),
          );
        }).toList()),
        if (_method == 'cash') ...[
          const SizedBox(height: 16),
          TextField(
            controller: _cashCtrl,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Получено (сум)',
              prefixIcon: Icon(Icons.payments_outlined),
            ),
            onChanged: (_) => setState(() {}),
          ),
          if (_change != null) ...[
            const SizedBox(height: 8),
            Text('Сдача: ${fmtNum(_change!)} сум',
              style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.success)),
          ],
        ],
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            icon: _loading
                ? const SizedBox(width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.check_circle_outline, size: 20),
            label: const Text('Принять оплату', style: TextStyle(fontSize: 16)),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: AppTheme.success),
            onPressed: _loading ? null : _submit,
          ),
        ),
      ]),
    );
  }
}
