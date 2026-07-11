import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import 'settings_page.dart';

class CashierPage extends StatefulWidget {
  const CashierPage({super.key});
  @override
  State<CashierPage> createState() => _CashierPageState();
}

class _CashierPageState extends State<CashierPage> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<dynamic> _orders = [];
  List<dynamic> _printerList = [];
  bool _loading = true;
  Timer? _timer;

  static const _statuses = ['new', 'accepted', 'cooking', 'ready'];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 5, vsync: this); // All + 4 statuses
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final branchId = context.read<AppState>().branchId;
    try {
      final results = await Future.wait([
        Api().orders(branchId: branchId),
        Api().printers(),
      ]);
      if (!mounted) return;
      setState(() {
        _orders = results[0].where((o) => _statuses.contains(o['status'])).toList();
        _printerList = results[1];
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> _filtered(int tabIndex) {
    if (tabIndex == 0) return _orders;
    return _orders.where((o) => o['status'] == _statuses[tabIndex - 1]).toList();
  }

  Future<void> _changeStatus(Map<String, dynamic> order, String newStatus) async {
    try {
      await Api().updateOrderStatus(order['id'], newStatus);
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Заказ #${order['order_number']} → ${_statusLabel(newStatus)}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка обновления статуса')),
        );
      }
    }
  }

  Future<void> _printReceipt(Map<String, dynamic> order) async {
    final branchId = context.read<AppState>().branchId;
    final printer = _printerList.cast<Map<String, dynamic>>().where(
      (p) => p['printer_type'] == 'receipt' && p['branch_id'] == branchId,
    ).firstOrNull;
    if (printer == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Принтер чеков не найден')),
        );
      }
      return;
    }
    try {
      await Api().printReceipt(order['id'], printer['id']);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Чек отправлен')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка печати')),
        );
      }
    }
  }

  void _showOrderDetail(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _OrderDetailSheet(
        order: order,
        onStatusChange: (s) { Navigator.pop(context); _changeStatus(order, s); },
        onPrint: () { Navigator.pop(context); _printReceipt(order); },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Scaffold(
      appBar: AppBar(
        leading: state.isAdmin
          ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: state.backToModes)
          : null,
        title: Text('Касса — ${state.displayName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage())),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'Все (${_orders.length})'),
            Tab(text: 'Новые (${_filtered(1).length})'),
            Tab(text: 'Принятые (${_filtered(2).length})'),
            Tab(text: 'Готовятся (${_filtered(3).length})'),
            Tab(text: 'Готовы (${_filtered(4).length})'),
          ],
        ),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : TabBarView(
            controller: _tabs,
            children: List.generate(5, (tabIdx) {
              final list = _filtered(tabIdx);
              if (list.isEmpty) {
                return const Center(child: Text('Нет заказов', style: TextStyle(color: AppTheme.textMuted)));
              }
              return RefreshIndicator(
                onRefresh: _load,
                child: ListView.builder(
                  padding: const EdgeInsets.all(10),
                  itemCount: list.length,
                  itemBuilder: (ctx, i) => _CashierOrderCard(
                    order: list[i],
                    onTap: () => _showOrderDetail(list[i]),
                    onStatusChange: _changeStatus,
                  ),
                ),
              );
            }),
          ),
    );
  }
}

// ── Order card ───────────────────────────────────────────────────────────────

class _CashierOrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final VoidCallback onTap;
  final Function(Map<String, dynamic>, String) onStatusChange;
  const _CashierOrderCard({required this.order, required this.onTap, required this.onStatusChange});

  @override
  Widget build(BuildContext context) {
    final items = order['items'] as List? ?? [];
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
              Text('#${order['order_number']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              if (order['table_number'] != null)
                Text('Стол ${order['table_number']}', style: const TextStyle(color: AppTheme.textMuted)),
              const Spacer(),
              _StatusBadge(status: status),
            ]),
            const SizedBox(height: 6),
            Text('${items.length} позиций', style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            const SizedBox(height: 4),
            Text('${_fmt(order['total_amount'])} сум',
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
          onPressed: () => onStatusChange(order, 'completed'),
        ));
      default:
        return const SizedBox.shrink();
    }
  }
}

// ── Order detail bottom sheet ────────────────────────────────────────────────

class _OrderDetailSheet extends StatelessWidget {
  final Map<String, dynamic> order;
  final Function(String) onStatusChange;
  final VoidCallback onPrint;
  const _OrderDetailSheet({required this.order, required this.onStatusChange, required this.onPrint});

  @override
  Widget build(BuildContext context) {
    final items = order['items'] as List? ?? [];
    final status = order['status'] as String;
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, scrollCtrl) => ListView(
        controller: scrollCtrl,
        padding: const EdgeInsets.all(20),
        children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(
            color: AppTheme.border, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          Row(children: [
            Text('Заказ #${order['order_number']}',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const Spacer(),
            _StatusBadge(status: status),
          ]),
          if (order['table_number'] != null) ...[
            const SizedBox(height: 4),
            Text('Стол ${order['table_number']}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 15)),
          ],
          if (order['note'] != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
              child: Text(order['note'], style: const TextStyle(color: AppTheme.warning)),
            ),
          ],
          const SizedBox(height: 16),
          const Text('Позиции', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ...items.map((item) => Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Text('×${item['quantity']}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.accent)),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['name'], style: const TextStyle(fontSize: 15)),
                if (item['note'] != null)
                  Text(item['note'], style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
              ])),
              Text('${_fmt(item['total'])} сум', style: const TextStyle(color: AppTheme.textMuted)),
            ]),
          )),
          const Divider(height: 24),
          Row(children: [
            const Text('Подытог', style: TextStyle(color: AppTheme.textMuted)),
            const Spacer(),
            Text('${_fmt(order['subtotal'])} сум'),
          ]),
          if (order['discount_amount'] != null && order['discount_amount'] != '0.00') ...[
            const SizedBox(height: 4),
            Row(children: [
              const Text('Скидка', style: TextStyle(color: AppTheme.success)),
              const Spacer(),
              Text('-${_fmt(order['discount_amount'])} сум', style: const TextStyle(color: AppTheme.success)),
            ]),
          ],
          const SizedBox(height: 8),
          Row(children: [
            const Text('Итого', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const Spacer(),
            Text('${_fmt(order['total_amount'])} сум',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.accent)),
          ]),
          const SizedBox(height: 20),
          // Actions
          if (status == 'new') ...[
            SizedBox(width: double.infinity, child: ElevatedButton(
              onPressed: () => onStatusChange('accepted'),
              child: const Text('Принять заказ'),
            )),
            const SizedBox(height: 8),
            SizedBox(width: double.infinity, child: OutlinedButton(
              onPressed: () => onStatusChange('cancelled'),
              style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
              child: const Text('Отменить заказ'),
            )),
          ],
          if (status == 'ready') ...[
            SizedBox(width: double.infinity, child: ElevatedButton.icon(
              icon: const Icon(Icons.check),
              label: const Text('Закрыть заказ'),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
              onPressed: () => onStatusChange('completed'),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(_statusLabel(status),
        style: TextStyle(color: _color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }

  Color get _color {
    const map = {'new': AppTheme.accentLight, 'accepted': Color(0xFF4ADE80),
                 'cooking': Color(0xFFFB923C), 'ready': Color(0xFF86EFAC)};
    return map[status] ?? AppTheme.textMuted;
  }
}

String _statusLabel(String s) {
  const map = {'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится',
               'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён'};
  return map[s] ?? s;
}

String _fmt(dynamic v) {
  final n = num.tryParse(v.toString()) ?? 0;
  return n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
