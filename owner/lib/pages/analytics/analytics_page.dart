import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({super.key});
  @override
  State<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  bool _loading = true;
  double _totalRevenue = 0;
  int _totalOrders = 0;
  double _avgCheck = 0;
  Map<String, int> _statusCounts = {};
  List<_PopularItem> _popular = [];
  List<double> _dailyRevenue = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final today = DateTime.now();
      final orders = await Api().orders(date: DateFormat('yyyy-MM-dd').format(today));

      final completed = orders.where((o) => o['status'] == 'completed').toList();
      _totalOrders = orders.length;
      _totalRevenue = completed.fold<double>(0, (s, o) => s + (double.tryParse(o['total_amount'].toString()) ?? 0));
      _avgCheck = completed.isNotEmpty ? _totalRevenue / completed.length : 0;

      // Status breakdown
      _statusCounts = {};
      for (final o in orders) {
        final s = o['status'] as String;
        _statusCounts[s] = (_statusCounts[s] ?? 0) + 1;
      }

      // Popular items
      final itemCounts = <String, _PopularItem>{};
      for (final o in orders) {
        for (final it in (o['items'] as List? ?? [])) {
          final name = it['name'] as String;
          final qty = (num.tryParse(it['quantity'].toString()) ?? 1).toInt();
          final rev = double.tryParse(it['total'].toString()) ?? 0;
          if (itemCounts.containsKey(name)) {
            itemCounts[name]!.qty += qty;
            itemCounts[name]!.revenue += rev;
          } else {
            itemCounts[name] = _PopularItem(name, qty, rev);
          }
        }
      }
      _popular = itemCounts.values.toList()..sort((a, b) => b.qty.compareTo(a.qty));

      // Last 7 days revenue
      _dailyRevenue = [];
      for (int d = 6; d >= 0; d--) {
        final day = today.subtract(Duration(days: d));
        try {
          final dayOrders = await Api().orders(date: DateFormat('yyyy-MM-dd').format(day));
          final rev = dayOrders
            .where((o) => o['status'] == 'completed')
            .fold<double>(0, (s, o) => s + (double.tryParse(o['total_amount'].toString()) ?? 0));
          _dailyRevenue.add(rev);
        } catch (_) {
          _dailyRevenue.add(0);
        }
      }

      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Аналитика'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: () { setState(() => _loading = true); _load(); })],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              // Summary cards
              Row(children: [
                Expanded(child: _card('Выручка', _fmtK(_totalRevenue), T.success)),
                const SizedBox(width: 10),
                Expanded(child: _card('Заказы', '$_totalOrders', T.accent)),
                const SizedBox(width: 10),
                Expanded(child: _card('Ср. чек', _fmtK(_avgCheck), T.warning)),
              ]),
              const SizedBox(height: 20),

              // Revenue chart
              if (_dailyRevenue.isNotEmpty) ...[
                const Text('Выручка за 7 дней', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                SizedBox(height: 200, child: _buildChart()),
                const SizedBox(height: 24),
              ],

              // Status breakdown
              const Text('Статусы заказов', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: _statusCounts.entries.map((e) {
                const labels = {'new': 'Новые', 'accepted': 'Приняты', 'cooking': 'Готовятся',
                                'ready': 'Готовы', 'completed': 'Закрыты', 'cancelled': 'Отменены'};
                const colors = {'new': T.accentLight, 'accepted': Color(0xFF4ADE80), 'cooking': Color(0xFFFB923C),
                                'ready': Color(0xFF86EFAC), 'completed': Color(0xFF64748B), 'cancelled': Color(0xFFF87171)};
                final c = colors[e.key] ?? T.muted;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: c.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: c.withValues(alpha: 0.3))),
                  child: Text('${labels[e.key] ?? e.key}: ${e.value}', style: TextStyle(color: c, fontWeight: FontWeight.w600)),
                );
              }).toList()),
              const SizedBox(height: 24),

              // Popular items
              const Text('Популярные блюда', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              ..._popular.take(10).indexed.map((entry) {
                final (i, item) = entry;
                return Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(10)),
                  child: Row(children: [
                    Container(
                      width: 28, height: 28, alignment: Alignment.center,
                      decoration: BoxDecoration(color: T.accent.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                      child: Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.bold, color: T.accent, fontSize: 13)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(item.name, style: const TextStyle(fontSize: 15))),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('×${item.qty}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text('${_fmtK(item.revenue)} сум', style: const TextStyle(color: T.muted, fontSize: 12)),
                    ]),
                  ]),
                );
              }),
              const SizedBox(height: 32),
            ]),
          ),
    );
  }

  Widget _card(String label, String value, Color color) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: T.border, width: 0.5)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(color: T.muted, fontSize: 12)),
    ]),
  );

  Widget _buildChart() {
    final maxY = _dailyRevenue.reduce((a, b) => a > b ? a : b);
    final today = DateTime.now();
    return BarChart(BarChartData(
      maxY: maxY * 1.2,
      barTouchData: BarTouchData(enabled: true),
      gridData: const FlGridData(show: false),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (v, _) {
          final day = today.subtract(Duration(days: 6 - v.toInt()));
          return Text(DateFormat('dd').format(day), style: const TextStyle(color: T.muted, fontSize: 11));
        })),
      ),
      barGroups: List.generate(_dailyRevenue.length, (i) => BarChartGroupData(x: i, barRods: [
        BarChartRodData(toY: _dailyRevenue[i], color: T.accent, width: 20, borderRadius: BorderRadius.circular(6)),
      ])),
    ));
  }

  String _fmtK(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }
}

class _PopularItem {
  final String name;
  int qty;
  double revenue;
  _PopularItem(this.name, this.qty, this.revenue);
}
