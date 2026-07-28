import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../core/app_state.dart';
import '../view_models/waiter_view_model.dart';
import '../widgets/common.dart';
import 'new_order_page.dart';

class WaiterPage extends StatefulWidget {
  const WaiterPage({super.key});
  @override
  State<WaiterPage> createState() => _WaiterPageState();
}

class _WaiterPageState extends State<WaiterPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final branchId = context.read<AppState>().branchId;
      context.read<WaiterViewModel>().start(branchId);
    });
  }

  Future<void> _printReceipt(Map<String, dynamic> order) async {
    final vm = context.read<WaiterViewModel>();
    if (vm.findReceiptPrinter() == null) {
      if (mounted) showSnack(context, 'Принтер чеков не найден', error: true);
      return;
    }
    final ok = await vm.printReceipt(order['id'] as String);
    if (!mounted) return;
    ok ? showSnack(context, 'Чек отправлен')
       : showSnack(context, 'Ошибка печати', error: true);
  }

  void _showDetail(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.65, maxChildSize: 0.95, minChildSize: 0.4,
        expand: false,
        builder: (ctx, scrollCtrl) {
          final items = order['items'] as List? ?? [];
          return ListView(
            controller: scrollCtrl,
            padding: EdgeInsets.fromLTRB(
              20, 20, 20, MediaQuery.of(ctx).padding.bottom + 20),
            children: [
              const DragHandle(),
              Text('Заказ #${order['order_number']}',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              if (order['table_number'] != null)
                Text('Стол ${order['table_number']}',
                  style: const TextStyle(color: AppTheme.textMuted)),
              const SizedBox(height: 16),
              ...items.map((it) => Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.bg, borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  Text('×${it['quantity']}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold, color: AppTheme.accent)),
                  const SizedBox(width: 12),
                  Expanded(child: Text(it['name'] as String,
                    style: const TextStyle(fontSize: 15))),
                  Text('${fmtNum(it['total'])} сум',
                    style: const TextStyle(
                      color: AppTheme.textMuted, fontSize: 13)),
                ]),
              )),
              const SizedBox(height: 12),
              Row(children: [
                const Text('Итого',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text('${fmtNum(order['total_amount'])} сум',
                  style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold,
                    color: AppTheme.accent)),
              ]),
              const SizedBox(height: 20),
              SizedBox(width: double.infinity, child: OutlinedButton.icon(
                icon: const Icon(Icons.print, size: 18),
                label: const Text('Печать чека'),
                onPressed: () { Navigator.pop(ctx); _printReceipt(order); },
              )),
              const SizedBox(height: 12),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final vm    = context.watch<WaiterViewModel>();
    return Scaffold(
      appBar: AppBar(
        leading: state.isAdmin
          ? IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: state.backToModes)
          : null,
        title: Text(state.displayName),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Новый заказ'),
        onPressed: () async {
          final created = await Navigator.push<bool>(
            context,
            MaterialPageRoute(builder: (_) => const NewOrderPage()),
          );
          if (created == true) vm.load();
        },
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: vm.loading
          ? const LoadingCenter(key: ValueKey('loading'))
          : RefreshIndicator(
              key: const ValueKey('list'),
              onRefresh: vm.load,
              child: vm.orders.isEmpty
                ? ListView(children: [
                    SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                    const EmptyState(
                      icon: Icons.restaurant_menu,
                      message: 'Нет активных заказов'),
                  ])
                : ListView.builder(
                    padding: EdgeInsets.fromLTRB(
                      16, 8, 16, MediaQuery.of(context).padding.bottom + 90),
                    itemCount: vm.orders.length,
                    itemBuilder: (ctx, i) {
                      final o     = vm.orders[i];
                      final items = o['items'] as List? ?? [];
                      return Dismissible(
                        key: ValueKey('w_${o['id']}'),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          decoration: BoxDecoration(
                            color: AppTheme.accent.withValues(alpha: 0.85),
                            borderRadius: BorderRadius.circular(16)),
                          child: const Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.print, color: Colors.white, size: 28),
                            SizedBox(height: 3),
                            Text('Чек', style: TextStyle(
                              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                          ]),
                        ),
                        confirmDismiss: (_) async {
                          await _printReceipt(o);
                          return false;
                        },
                        child: Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => _showDetail(o),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                            Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.accent.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8)),
                                child: Text('#${o['order_number']}',
                                  style: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.bold,
                                    color: AppTheme.accent)),
                              ),
                              if (o['table_number'] != null) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppTheme.surfaceLight,
                                    borderRadius: BorderRadius.circular(8)),
                                  child: Row(mainAxisSize: MainAxisSize.min,
                                    children: [
                                    const Icon(Icons.table_restaurant,
                                      size: 14, color: AppTheme.textMuted),
                                    const SizedBox(width: 4),
                                    Text('${o['table_number']}',
                                      style: const TextStyle(fontSize: 13)),
                                  ]),
                                ),
                              ],
                              const Spacer(),
                              StatusBadge(o['status'] as String),
                            ]),
                            const SizedBox(height: 10),
                            ...items.take(3).map((it) => Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Text('${it['name']}  ×${it['quantity']}',
                                style: const TextStyle(
                                  color: AppTheme.textMuted, fontSize: 13)),
                            )),
                            if (items.length > 3)
                              Text('+ещё ${items.length - 3}',
                                style: const TextStyle(
                                  color: AppTheme.textMuted, fontSize: 13,
                                  fontStyle: FontStyle.italic)),
                            const SizedBox(height: 8),
                            Row(children: [
                              Text(fmtNum(o['total_amount']),
                                style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.bold)),
                              const Text(' сум',
                                style: TextStyle(
                                  color: AppTheme.textMuted, fontSize: 14)),
                              const Spacer(),
                              if (o['status'] == 'ready')
                                const Icon(Icons.check_circle,
                                  color: AppTheme.success, size: 22),
                            ]),
                          ]),
                        ),
                      ),
                    ),
                  );
                    },
                  ),
            ),
      ),
    );
  }
}
