import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import 'settings_page.dart';

class KitchenPage extends StatefulWidget {
  final String title;
  final Color accentColor;
  const KitchenPage({super.key, this.title = 'Кухня', this.accentColor = AppTheme.danger});
  @override
  State<KitchenPage> createState() => _KitchenPageState();
}

class _KitchenPageState extends State<KitchenPage> {
  List<dynamic> _orders = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final branchId = context.read<AppState>().branchId;
      final list = await Api().kitchenOrders(branchId);
      if (mounted) setState(() { _orders = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _acceptOrder(Map<String, dynamic> order) async {
    try {
      await Api().updateOrderStatus(order['id'], 'cooking');
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка')),
        );
      }
    }
  }

  Future<void> _markItemReady(String itemId) async {
    try {
      await Api().itemDone(itemId);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка')),
        );
      }
    }
  }

  Future<void> _markOrderReady(Map<String, dynamic> order) async {
    try {
      await Api().updateOrderStatus(order['id'], 'ready');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Заказ #${order['order_number']} готов!')),
        );
      }
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка')),
        );
      }
    }
  }

  String _waitTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final diff = DateTime.now().toUtc().difference(dt);
    if (diff.inMinutes < 1) return 'Только что';
    if (diff.inMinutes < 60) return '${diff.inMinutes} мин';
    return '${diff.inHours}ч ${diff.inMinutes % 60}м';
  }

  Color _waitColor(String? iso) {
    if (iso == null) return AppTheme.textMuted;
    final dt = DateTime.tryParse(iso);
    if (dt == null) return AppTheme.textMuted;
    final mins = DateTime.now().toUtc().difference(dt).inMinutes;
    if (mins < 10) return AppTheme.success;
    if (mins < 20) return AppTheme.warning;
    return AppTheme.danger;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        backgroundColor: AppTheme.surface,
        leading: state.isAdmin
          ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: state.backToModes)
          : null,
        title: Text(widget.title),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: widget.accentColor, borderRadius: BorderRadius.circular(4)),
            child: Text('${_orders.length}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          ),
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.danger, borderRadius: BorderRadius.circular(4)),
            child: const Text('LIVE', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage())),
          ),
        ],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _orders.isEmpty
              ? const Center(child: Text('Нет заказов', style: TextStyle(color: AppTheme.textMuted, fontSize: 18)))
              : ListView.builder(
                  padding: const EdgeInsets.all(10),
                  itemCount: _orders.length,
                  itemBuilder: (ctx, i) => _buildOrderCard(_orders[i]),
                ),
          ),
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> order) {
    final items = order['items'] as List? ?? [];
    final status = order['status'] as String;
    final allItemsReady = items.isNotEmpty && items.every((it) => it['status'] == 'ready');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        border: Border.all(
          color: status == 'new'
            ? AppTheme.accentLight
            : allItemsReady
              ? AppTheme.success
              : widget.accentColor.withValues(alpha: 0.4),
          width: 2,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header
        Row(children: [
          Text('#${order['order_number']}',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          if (order['table_number'] != null) ...[
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(4)),
              child: Text('Стол ${order['table_number']}', style: const TextStyle(fontSize: 14)),
            ),
          ],
          const Spacer(),
          Icon(Icons.access_time, size: 16, color: _waitColor(order['created_at'])),
          const SizedBox(width: 4),
          Text(_waitTime(order['created_at']),
            style: TextStyle(color: _waitColor(order['created_at']), fontWeight: FontWeight.w600, fontSize: 14)),
        ]),
        if (order['note'] != null) ...[
          const SizedBox(height: 6),
          Text(order['note'], style: const TextStyle(color: AppTheme.warning, fontSize: 14)),
        ],
        const SizedBox(height: 10),

        // Items
        ...items.map((item) => _buildItemRow(item, status)),

        const SizedBox(height: 10),

        // Actions
        if (status == 'new')
          SizedBox(width: double.infinity, child: ElevatedButton.icon(
            icon: const Icon(Icons.restaurant, size: 18),
            label: const Text('Начать готовить', style: TextStyle(fontSize: 16)),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.accent,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: () => _acceptOrder(order),
          )),

        if (status == 'cooking' && allItemsReady)
          SizedBox(width: double.infinity, child: ElevatedButton.icon(
            icon: const Icon(Icons.check_circle, size: 20),
            label: const Text('Заказ готов!', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.success,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: () => _markOrderReady(order),
          )),
      ]),
    );
  }

  Widget _buildItemRow(dynamic item, String orderStatus) {
    final done = item['status'] == 'ready';
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: done ? const Color(0xFF082514) : AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: done ? AppTheme.success.withValues(alpha: 0.2) : AppTheme.danger.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text('${item['quantity']}',
            style: TextStyle(
              fontWeight: FontWeight.bold, fontSize: 16,
              color: done ? AppTheme.success : AppTheme.danger)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(item['name'], style: TextStyle(
            fontSize: 16, fontWeight: FontWeight.w500,
            decoration: done ? TextDecoration.lineThrough : null,
            color: done ? AppTheme.textMuted : AppTheme.textColor,
          )),
          if (item['note'] != null)
            Text(item['note'], style: const TextStyle(color: AppTheme.warning, fontSize: 12)),
        ])),
        if (!done && orderStatus == 'cooking')
          SizedBox(
            height: 36,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.success,
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onPressed: () => _markItemReady(item['id']),
              child: const Text('Готово'),
            ),
          ),
        if (done)
          const Icon(Icons.check_circle, color: AppTheme.success, size: 28),
      ]),
    );
  }
}
