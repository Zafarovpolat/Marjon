import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import 'menu/menu_page.dart';
import 'staff/staff_page.dart';
import 'branches/branches_page.dart';
import 'analytics/analytics_page.dart';
import 'printers/printers_page.dart';
import 'orders/orders_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _todayOrders = 0;
  double _todayRevenue = 0;
  int _activeProducts = 0;
  final int _staffCount = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final results = await Future.wait([
        Api().orders(date: today),
        Api().products(),
      ]);
      final ordersList = results[0];
      final productsList = results[1];
      if (!mounted) return;
      setState(() {
        _todayOrders = ordersList.length;
        _todayRevenue = ordersList.fold<double>(0, (s, o) => s + (double.tryParse(o['total_amount'].toString()) ?? 0));
        _activeProducts = productsList.where((p) => p['is_active'] == true).length;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Marjon Owner'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout), onPressed: state.logout),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Welcome
            Text('Добро пожаловать, ${state.displayName}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),

            // Stats cards
            if (!_loading) ...[
              Row(children: [
                Expanded(child: _StatCard(label: 'Заказы сегодня', value: '$_todayOrders', icon: Icons.receipt_long, color: T.accent)),
                const SizedBox(width: 10),
                Expanded(child: _StatCard(label: 'Выручка', value: '${_fmtK(_todayRevenue)}', icon: Icons.payments, color: T.success)),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _StatCard(label: 'Блюда', value: _activeProducts.toString(), icon: Icons.restaurant_menu, color: T.warning)),
                const SizedBox(width: 10),
                Expanded(child: _StatCard(label: 'Сотрудники', value: _staffCount.toString(), icon: Icons.people, color: T.muted)),
              ]),
            ] else
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),

            const SizedBox(height: 24),
            const Text('Управление', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: T.muted)),
            const SizedBox(height: 12),

            _MenuTile(icon: Icons.restaurant_menu, label: 'Меню', sub: 'Категории, блюда, цены', color: T.warning,
              onTap: () => _push(context, const MenuPage())),
            _MenuTile(icon: Icons.people, label: 'Сотрудники', sub: 'Добавить, роли', color: T.accent,
              onTap: () => _push(context, const StaffPage())),
            _MenuTile(icon: Icons.location_on, label: 'Филиалы', sub: 'Филиалы и столы', color: T.success,
              onTap: () => _push(context, const BranchesPage())),
            _MenuTile(icon: Icons.receipt_long, label: 'Заказы', sub: 'История и статусы', color: const Color(0xFF8B5CF6),
              onTap: () => _push(context, const OrdersPage())),
            _MenuTile(icon: Icons.bar_chart, label: 'Аналитика', sub: 'Выручка, популярные блюда', color: const Color(0xFFEC4899),
              onTap: () => _push(context, const AnalyticsPage())),
            _MenuTile(icon: Icons.print, label: 'Принтеры', sub: 'Настройка оборудования', color: T.muted,
              onTap: () => _push(context, const PrintersPage())),
          ],
        ),
      ),
    );
  }

  void _push(BuildContext ctx, Widget page) =>
    Navigator.push(ctx, MaterialPageRoute(builder: (_) => page));

  String _fmtK(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }
}

class _StatCard extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(16),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 10),
        Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: T.muted, fontSize: 13)),
      ]),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label, sub;
  final Color color;
  final VoidCallback onTap;
  const _MenuTile({required this.icon, required this.label, required this.sub, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(
          width: 44, height: 44, alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(sub, style: const TextStyle(color: T.muted, fontSize: 13)),
        trailing: const Icon(Icons.chevron_right, color: T.muted),
        onTap: onTap,
      ),
    );
  }
}
