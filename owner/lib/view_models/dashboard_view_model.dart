import 'package:flutter/foundation.dart';
import '../core/api.dart';
import '../widgets/common.dart';

class DashboardViewModel extends ChangeNotifier {
  DateTime _date = DateTime.now();
  bool _loading = false;
  int _chartDays = 7;

  int    _ordersCount  = 0;
  double _revenue      = 0;
  double _avgCheck     = 0;
  double _incomeTotal  = 0;
  double _expenseTotal = 0;
  double _yRevenue     = 0;
  int    _yOrdersCount = 0;

  List<double>               _chartData    = List.filled(7, 0);
  List<Map<String, dynamic>> _topDishes    = [];
  List<Map<String, dynamic>> _recentOrders = [];

  // ── Immutable state getters ─────────────────────────────────────────────────
  DateTime get date         => _date;
  bool     get loading      => _loading;
  int      get chartDays    => _chartDays;
  int      get ordersCount  => _ordersCount;
  double   get revenue      => _revenue;
  double   get avgCheck     => _avgCheck;
  double   get incomeTotal  => _incomeTotal;
  double   get expenseTotal => _expenseTotal;
  double   get yRevenue     => _yRevenue;
  int      get yOrdersCount => _yOrdersCount;

  List<double>               get chartData    => List.unmodifiable(_chartData);
  List<Map<String, dynamic>> get topDishes    => List.unmodifiable(_topDishes);
  List<Map<String, dynamic>> get recentOrders => List.unmodifiable(_recentOrders);

  // ── Commands ────────────────────────────────────────────────────────────────
  void prevDay() { _date = _date.subtract(const Duration(days: 1)); load(); }

  void nextDay() {
    final next = _date.add(const Duration(days: 1));
    if (!next.isAfter(DateTime.now())) { _date = next; load(); }
  }

  void pickDay(DateTime d) { _date = d; load(); }

  void setChartDays(int days) { _chartDays = days; load(); }

  String delta(double today, double yesterday) {
    if (yesterday == 0) return today > 0 ? '+100%' : '0%';
    final pct = ((today - yesterday) / yesterday * 100).round();
    return '${pct >= 0 ? '+' : ''}$pct%';
  }

  bool positive(double today, double yesterday) => today >= yesterday;

  Future<void> load() async {
    _loading = true;
    notifyListeners();

    final d     = fmtIsoDate(_date);
    final yd    = fmtIsoDate(_date.subtract(const Duration(days: 1)));
    final wStart = fmtIsoDate(_date.subtract(Duration(days: _chartDays - 1)));

    try {
      final results = await Future.wait([
        Api().reportOrders(dateFrom: d, dateTo: d),
        Api().reportOrders(dateFrom: yd, dateTo: yd),
        Api().financeTransactions(dateFrom: d, dateTo: d),
        Api().reportDishes(dateFrom: wStart, dateTo: d),
        Api().reportOrders(dateFrom: wStart, dateTo: d),
      ]);

      final today     = results[0];
      final yesterday = results[1];
      final finance   = results[2];
      final dishes    = results[3];
      final week      = results[4];

      final todayItems = (today['items'] as List? ?? []);
      _ordersCount = toInt(today['count']) > 0 ? toInt(today['count']) : todayItems.length;
      _revenue     = toDouble(today['total']);
      _avgCheck    = _ordersCount > 0 ? _revenue / _ordersCount : 0;

      _yOrdersCount = toInt(yesterday['count']);
      _yRevenue     = toDouble(yesterday['total']);

      final txItems = (finance['items'] as List? ?? []);
      _incomeTotal  = txItems.where((t) => t['direction'] == 'income')
          .fold(0.0, (s, t) => s + toDouble(t['amount']));
      _expenseTotal = txItems.where((t) => t['direction'] == 'expense')
          .fold(0.0, (s, t) => s + toDouble(t['amount']));

      final allOrders = (week['items'] as List? ?? []);
      final byDay = <String, double>{};
      for (int i = 0; i < _chartDays; i++) {
        byDay[fmtIsoDate(_date.subtract(Duration(days: _chartDays - 1 - i)))] = 0;
      }
      for (final o in allOrders) {
        final raw = (o['created_at'] as String?) ?? '';
        if (raw.length >= 10) {
          final day = raw.substring(0, 10);
          byDay[day] = (byDay[day] ?? 0) + toDouble(o['total'] ?? o['total_amount']);
        }
      }
      _chartData = byDay.values.toList();

      final dishItems = (dishes['items'] as List? ?? []);
      _topDishes = List<Map<String, dynamic>>.from(dishItems)
        ..sort((a, b) => toDouble(b['quantity']).compareTo(toDouble(a['quantity'])));

      _recentOrders = List<Map<String, dynamic>>.from(allOrders)
        ..sort((a, b) => ((b['created_at'] ?? '') as String)
            .compareTo((a['created_at'] ?? '') as String));
      if (_recentOrders.length > 10) _recentOrders = _recentOrders.sublist(0, 10);
    } catch (_) {}

    _loading = false;
    notifyListeners();
  }
}
