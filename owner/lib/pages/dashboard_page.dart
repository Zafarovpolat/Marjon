import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import 'menu/menu_page.dart';
import 'staff/staff_page.dart';
import 'orders/orders_page.dart';
import 'analytics/analytics_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _tab = 0;
  DateTime _date = DateTime.now();

  // KPI
  bool _loading = true;
  int _ordersCount = 0;
  double _revenue = 0;
  double _avgCheck = 0;
  double _incomeTotal = 0;
  double _expenseTotal = 0;

  // 7-day chart
  List<double> _chartData = List.filled(7, 0);
  String _chartPeriod = '';

  // Top dishes
  List<Map<String, dynamic>> _topDishes = [];

  // Recent orders
  List<Map<String, dynamic>> _recentOrders = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _fmt(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  Future<void> _load() async {
    setState(() => _loading = true);
    final date = _fmt(_date);
    final weekStart = _date.subtract(const Duration(days: 6));
    final weekStartStr = _fmt(weekStart);

    try {
      final results = await Future.wait([
        Api().reportOrders(dateFrom: date, dateTo: date),
        Api().financeTransactions(dateFrom: date, dateTo: date),
        Api().reportDishes(dateFrom: weekStartStr, dateTo: date),
        Api().reportOrders(dateFrom: weekStartStr, dateTo: date),
      ]);

      final todayData = results[0];
      final financeData = results[1];
      final dishesData = results[2];
      final weekData = results[3];

      // Today KPIs
      final todayItems = (todayData['items'] as List? ?? []);
      _ordersCount = todayData['count'] as int? ?? todayItems.length;
      _revenue = (todayData['total'] as num?)?.toDouble() ?? 0;
      _avgCheck = _ordersCount > 0 ? _revenue / _ordersCount : 0;

      // Finance
      final txItems = (financeData['items'] as List? ?? []);
      _incomeTotal = txItems
          .where((t) => t['direction'] == 'income')
          .fold<double>(0, (s, t) => s + (t['amount'] as num? ?? 0).toDouble());
      _expenseTotal = txItems
          .where((t) => t['direction'] == 'expense')
          .fold<double>(0, (s, t) => s + (t['amount'] as num? ?? 0).toDouble());

      // Top dishes
      final dishItems = (dishesData['items'] as List? ?? []);
      _topDishes = dishItems
          .map((d) => Map<String, dynamic>.from(d as Map))
          .toList()
        ..sort((a, b) => (b['quantity'] as num? ?? 0).compareTo(a['quantity'] as num? ?? 0));

      // Chart: aggregate by day from weekData
      final allOrders = (weekData['items'] as List? ?? []);
      final Map<String, double> byDay = {};
      for (int i = 0; i < 7; i++) {
        byDay[_fmt(_date.subtract(Duration(days: 6 - i)))] = 0;
      }
      for (final o in allOrders) {
        final raw = o['created_at'] as String?;
        if (raw == null) continue;
        final day = raw.substring(0, 10);
        byDay[day] = (byDay[day] ?? 0) + (o['total'] as num? ?? 0).toDouble();
      }
      _chartData = byDay.values.toList();

      // Recent orders
      _recentOrders = allOrders
          .map((o) => Map<String, dynamic>.from(o as Map))
          .toList()
        ..sort((a, b) {
          final aT = a['created_at'] as String? ?? '';
          final bT = b['created_at'] as String? ?? '';
          return bT.compareTo(aT);
        });
      if (_recentOrders.length > 10) _recentOrders = _recentOrders.sublist(0, 10);

      _chartPeriod = '${DateFormat('d MMM yyyy', 'ru').format(weekStart)} — ${DateFormat('d MMM yyyy', 'ru').format(_date)}';
    } catch (_) {}

    if (mounted) setState(() => _loading = false);
  }

  void _prevDay() { setState(() { _date = _date.subtract(const Duration(days: 1)); _load(); }); }
  void _nextDay() {
    final tomorrow = _date.add(const Duration(days: 1));
    if (tomorrow.isBefore(DateTime.now().add(const Duration(days: 1)))) {
      setState(() { _date = tomorrow; _load(); });
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      body: IndexedStack(
        index: _tab,
        children: [
          _buildHome(),
          const AnalyticsPage(),
          const StaffPage(),
          const MenuPage(),
          _buildMore(),
        ],
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }

  Widget _buildBottomNav() => BottomNavigationBar(
    type: BottomNavigationBarType.fixed,
    currentIndex: _tab,
    onTap: (i) => setState(() => _tab = i),
    backgroundColor: T.surface,
    selectedItemColor: T.accent,
    unselectedItemColor: T.muted,
    showUnselectedLabels: true,
    selectedFontSize: 10,
    unselectedFontSize: 10,
    elevation: 0,
    items: const [
      BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Дашборд'),
      BottomNavigationBarItem(icon: Icon(Icons.bar_chart_outlined), activeIcon: Icon(Icons.bar_chart), label: 'Отчёты'),
      BottomNavigationBarItem(icon: Icon(Icons.people_outline), activeIcon: Icon(Icons.people), label: 'Сотрудники'),
      BottomNavigationBarItem(icon: Icon(Icons.restaurant_menu_outlined), activeIcon: Icon(Icons.restaurant_menu), label: 'Меню'),
      BottomNavigationBarItem(icon: Icon(Icons.more_horiz), label: 'Ещё'),
    ],
  );

  // ── Home tab ─────────────────────────────────────────────────────────────

  Widget _buildHome() => RefreshIndicator(
    color: T.accent,
    onRefresh: _load,
    child: CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _buildHeader()),
        if (_loading)
          const SliverFillRemaining(child: Center(child: CircularProgressIndicator(color: T.accent)))
        else ...[
          SliverToBoxAdapter(child: _buildKpiGrid()),
          SliverToBoxAdapter(child: _buildRevenueSection()),
          SliverToBoxAdapter(child: _buildWarehouseRow()),
          SliverToBoxAdapter(child: _buildTopDishes()),
          SliverToBoxAdapter(child: _buildRecentOrders()),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ],
    ),
  );

  // ── Header ───────────────────────────────────────────────────────────────

  Widget _buildHeader() => SafeArea(
    bottom: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(children: [
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context, initialDate: _date,
              firstDate: DateTime(2024), lastDate: DateTime.now(),
              builder: (_, child) => Theme(
                data: ThemeData.dark().copyWith(colorScheme: const ColorScheme.dark(primary: T.accent)),
                child: child!,
              ),
            );
            if (picked != null) setState(() { _date = picked; _load(); });
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: T.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: T.border, width: 0.5),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.calendar_today_outlined, size: 15, color: T.muted),
              const SizedBox(width: 6),
              Text(DateFormat('dd.MM.yyyy').format(_date),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: T.text)),
            ]),
          ),
        ),
        const SizedBox(width: 8),
        _iconBtn(Icons.chevron_left, _prevDay),
        const SizedBox(width: 4),
        _iconBtn(Icons.chevron_right, _nextDay),
        const Spacer(),
        _iconBtn(Icons.notifications_outlined, () {}),
        const SizedBox(width: 8),
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(color: T.blue, borderRadius: BorderRadius.circular(9)),
          child: const Icon(Icons.grid_view_rounded, size: 18, color: Colors.white),
        ),
      ]),
    ),
  );

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 34, height: 34, alignment: Alignment.center,
      decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(9),
        border: Border.all(color: T.border, width: 0.5)),
      child: Icon(icon, size: 18, color: T.muted),
    ),
  );

  // ── KPI Grid ─────────────────────────────────────────────────────────────

  Widget _buildKpiGrid() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
    child: Column(children: [
      Row(children: [
        Expanded(child: _KpiCard(
          label: 'ВЫРУЧКА ЗА ДЕНЬ',
          value: _fmtNum(_revenue),
          unit: 'UZS',
          tag: DateFormat('dd.MM.yyyy').format(_date),
          tagColor: T.accent,
          icon: Icons.sync_alt,
          delta: '+27%',
          deltaPositive: true,
        )),
        const SizedBox(width: 10),
        Expanded(child: _KpiCard(
          label: 'ЗАКАЗОВ',
          value: '$_ordersCount',
          tag: 'Live',
          tagColor: T.danger,
          icon: Icons.receipt_outlined,
          delta: '+${_ordersCount > 0 ? _ordersCount : 0}',
          deltaPositive: true,
        )),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _KpiCard(
          label: 'СРЕДНИЙ ЧЕК',
          value: _fmtNum(_avgCheck),
          unit: 'UZS',
          tag: 'Среднее',
          tagColor: T.warning,
          icon: Icons.trending_up,
          delta: '',
          deltaPositive: true,
        )),
        const SizedBox(width: 10),
        Expanded(child: _KpiCard(
          label: 'ДЕНЕЖНЫЙ ПРИХОД',
          value: _fmtNum(_incomeTotal),
          unit: 'UZS',
          tag: 'Приход',
          tagColor: T.success,
          icon: Icons.arrow_downward,
          delta: '',
          deltaPositive: true,
        )),
      ]),
      const SizedBox(height: 10),
      _KpiCard(
        label: 'ДЕНЕЖНЫЕ РАСХОДЫ',
        value: _fmtNum(_expenseTotal),
        unit: 'UZS',
        tag: 'Расход',
        tagColor: const Color(0xFFFB923C),
        icon: Icons.adjust,
        delta: '',
        deltaPositive: false,
        wide: true,
      ),
    ]),
  );

  // ── Revenue analytics ─────────────────────────────────────────────────────

  Widget _buildRevenueSection() {
    final validData = _chartData.where((v) => v > 0).toList();
    final maxVal = validData.isEmpty ? 1.0 : validData.reduce((a, b) => a > b ? a : b);
    final minVal = validData.isEmpty ? 0.0 : validData.reduce((a, b) => a < b ? a : b);
    final avgVal = validData.isEmpty ? 0.0 : validData.fold(0.0, (s, v) => s + v) / validData.length;
    final today = _date;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('REVENUE ANALYTICS',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: T.muted, letterSpacing: 1.2)),
        const SizedBox(height: 6),
        Row(children: [
          const Text('Выручка за 7 дней',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsPage())),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: T.accentSubtle,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: T.accent.withValues(alpha: 0.4)),
              ),
              child: const Text('Подробнее', style: TextStyle(color: T.accent, fontSize: 13, fontWeight: FontWeight.w500)),
            ),
          ),
        ]),
        if (_chartPeriod.isNotEmpty) ...[
          const SizedBox(height: 4),
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(7),
                border: Border.all(color: T.border, width: 0.5)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.calendar_today_outlined, size: 12, color: T.muted),
                const SizedBox(width: 5),
                Text(_chartPeriod, style: const TextStyle(fontSize: 12, color: T.muted)),
                const SizedBox(width: 4),
                const Icon(Icons.expand_more, size: 14, color: T.muted),
              ]),
            ),
          ]),
        ],
        const SizedBox(height: 16),

        // Stats row
        Row(children: [
          _chartStat('Максимум', maxVal),
          const SizedBox(width: 10),
          _chartStat('Минимум', minVal),
          const SizedBox(width: 10),
          _chartStat('Среднее', avgVal),
        ]),
        const SizedBox(height: 16),

        // Line chart
        SizedBox(
          height: 180,
          child: _buildLineChart(today),
        ),
      ]),
    );
  }

  Widget _chartStat(String label, double val) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 11, color: T.muted)),
        const SizedBox(height: 4),
        Text(_fmtNum(val), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: T.text)),
        Text('UZS', style: const TextStyle(fontSize: 10, color: T.muted)),
      ]),
    ),
  );

  Widget _buildLineChart(DateTime today) {
    final spots = List.generate(_chartData.length, (i) => FlSpot(i.toDouble(), _chartData[i]));
    final maxY = _chartData.isEmpty ? 1.0 : (_chartData.reduce((a, b) => a > b ? a : b)) * 1.25;

    return LineChart(LineChartData(
      minX: 0,
      maxX: 6,
      minY: 0,
      maxY: maxY,
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        horizontalInterval: maxY > 0 ? maxY / 4 : 1,
        getDrawingHorizontalLine: (_) => FlLine(color: T.border, strokeWidth: 0.5),
      ),
      borderData: FlBorderData(show: false),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => T.surface,
          tooltipBorder: const BorderSide(color: T.border),
          getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
            _fmtNum(s.y),
            const TextStyle(color: T.accent, fontWeight: FontWeight.w600, fontSize: 12),
          )).toList(),
        ),
      ),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 44,
          getTitlesWidget: (v, _) => Text(
            v == 0 ? '0' : '${(v / 1000000).toStringAsFixed(1)}M',
            style: const TextStyle(color: T.muted, fontSize: 10),
          ),
        )),
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 28,
          getTitlesWidget: (v, _) {
            final d = today.subtract(Duration(days: 6 - v.toInt()));
            return Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(DateFormat('dd.MM').format(d),
                style: const TextStyle(color: T.muted, fontSize: 10)),
            );
          },
        )),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots,
          isCurved: true,
          curveSmoothness: 0.35,
          color: T.accent,
          barWidth: 2.5,
          isStrokeCapRound: true,
          dotData: FlDotData(
            show: true,
            getDotPainter: (spot, _, __, ___) => FlDotCirclePainter(
              radius: 4,
              color: T.accent,
              strokeWidth: 2,
              strokeColor: T.bg,
            ),
          ),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [T.accent.withValues(alpha: 0.2), T.accent.withValues(alpha: 0)],
            ),
          ),
        ),
      ],
    ));
  }

  // ── Warehouse row ─────────────────────────────────────────────────────────

  Widget _buildWarehouseRow() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
    child: Column(children: [
      _warehouseCard(Icons.download_outlined, 'Приход товаров', _incomeTotal, T.success),
      const SizedBox(height: 8),
      _warehouseCard(Icons.upload_outlined, 'Расход товаров', _expenseTotal, const Color(0xFFFB923C)),
    ]),
  );

  Widget _warehouseCard(IconData icon, String label, double value, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    decoration: BoxDecoration(
      color: T.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: T.border, width: 0.5),
    ),
    child: Row(children: [
      Container(
        width: 40, height: 40,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 20),
      ),
      const SizedBox(width: 12),
      Expanded(child: Text(label, style: const TextStyle(fontSize: 14, color: T.text, fontWeight: FontWeight.w500))),
      Text('${_fmtNum(value)} UZS',
        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color)),
    ]),
  );

  // ── Top dishes ────────────────────────────────────────────────────────────

  Widget _buildTopDishes() {
    if (_topDishes.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('Топ блюда', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage())),
            child: const Text('Все', style: TextStyle(fontSize: 13, color: T.accent)),
          ),
        ]),
        const SizedBox(height: 12),
        ..._topDishes.take(5).toList().asMap().entries.map((e) {
          final i = e.key;
          final d = e.value;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: T.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: T.border, width: 0.5),
            ),
            child: Row(children: [
              Container(
                width: 30, height: 30, alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: i == 0 ? T.accent.withValues(alpha: 0.15) : T.surfaceLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('${i + 1}', style: TextStyle(
                  fontWeight: FontWeight.bold, fontSize: 13,
                  color: i == 0 ? T.accent : T.muted,
                )),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(d['name']?.toString() ?? '—',
                style: const TextStyle(fontSize: 14, color: T.text, fontWeight: FontWeight.w500))),
              Text('${_fmtNum((d['quantity'] as num?)?.toDouble() ?? 0)} шт',
                style: const TextStyle(fontSize: 13, color: T.muted)),
              const SizedBox(width: 12),
              Text('${_fmtNum((d['total'] as num?)?.toDouble() ?? 0)} UZS',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: T.text)),
            ]),
          );
        }),
      ]),
    );
  }

  // ── Recent orders ─────────────────────────────────────────────────────────

  Widget _buildRecentOrders() {
    if (_recentOrders.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('Последние заказы', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage())),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: T.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: T.border, width: 0.5),
              ),
              child: const Text('Все заказы', style: TextStyle(fontSize: 12, color: T.muted)),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        ..._recentOrders.take(8).map((o) => _buildOrderRow(o)),
      ]),
    );
  }

  Widget _buildOrderRow(Map<String, dynamic> o) {
    final orderNum = o['order_number']?.toString() ?? '—';
    final status = o['status']?.toString() ?? '';
    final rawTotal = o['total'] ?? o['total_amount'];
    final total = (rawTotal is num) ? rawTotal.toDouble() : double.tryParse(rawTotal?.toString() ?? '') ?? 0.0;
    final table = o['table_number']?.toString();
    final type = o['order_type']?.toString();
    final createdAt = o['created_at']?.toString();

    String timeStr = '';
    if (createdAt != null) {
      try {
        final dt = DateTime.parse(createdAt).toLocal();
        timeStr = DateFormat('dd.MM.yyyy HH:mm').format(dt);
      } catch (_) {}
    }

    String locationLabel = '';
    if (table != null && table != 'null') {
      locationLabel = 'Стол $table';
    } else if (type == 'delivery') {
      locationLabel = 'Доставка';
    } else if (type == 'takeaway') {
      locationLabel = 'Навынос';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('#$orderNum', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: T.text)),
            if (timeStr.isNotEmpty) ...[
              const SizedBox(width: 8),
              Text(timeStr, style: const TextStyle(fontSize: 11, color: T.muted)),
            ],
            if (locationLabel.isNotEmpty) ...[
              const SizedBox(width: 8),
              Text(locationLabel, style: const TextStyle(fontSize: 12, color: T.muted)),
            ],
          ]),
          const SizedBox(height: 4),
          Text('${_fmtNum(total)} UZS',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
        ])),
        _StatusBadge(status: status),
      ]),
    );
  }

  // ── More tab ──────────────────────────────────────────────────────────────

  Widget _buildMore() {
    final state = context.read<AppState>();
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(title: const Text('Ещё')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _moreTile(Icons.receipt_long, 'Заказы', T.purple,
          () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage()))),
        _moreTile(Icons.location_on, 'Филиалы', T.success,
          () {}),
        _moreTile(Icons.print, 'Принтеры', T.muted,
          () {}),
        const SizedBox(height: 24),
        Container(
          decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(14),
            border: Border.all(color: T.border, width: 0.5)),
          child: ListTile(
            leading: const Icon(Icons.logout, color: T.danger),
            title: const Text('Выйти', style: TextStyle(color: T.danger)),
            onTap: state.logout,
          ),
        ),
      ]),
    );
  }

  Widget _moreTile(IconData icon, String label, Color color, VoidCallback onTap) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(14),
      border: Border.all(color: T.border, width: 0.5)),
    child: ListTile(
      leading: Container(
        width: 40, height: 40, alignment: Alignment.center,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: T.text)),
      trailing: const Icon(Icons.chevron_right, color: T.muted),
      onTap: onTap,
    ),
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final String? unit;
  final String tag;
  final Color tagColor;
  final IconData icon;
  final String delta;
  final bool deltaPositive;
  final bool wide;

  const _KpiCard({
    required this.label,
    required this.value,
    this.unit,
    required this.tag,
    required this.tagColor,
    required this.icon,
    required this.delta,
    required this.deltaPositive,
    this.wide = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: wide ? double.infinity : null,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 20, color: T.muted),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: tagColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(tag, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: tagColor)),
          ),
        ]),
        const SizedBox(height: 10),
        Text(label, style: const TextStyle(fontSize: 10, color: T.muted, fontWeight: FontWeight.w500, letterSpacing: 0.4)),
        const SizedBox(height: 4),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: Text(value,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: T.text),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          if (unit != null) ...[
            const SizedBox(width: 4),
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(unit!, style: const TextStyle(fontSize: 11, color: T.muted)),
            ),
          ],
        ]),
        if (delta.isNotEmpty) ...[
          const SizedBox(height: 4),
          Row(children: [
            Icon(
              deltaPositive ? Icons.arrow_upward : Icons.arrow_downward,
              size: 11,
              color: deltaPositive ? T.success : T.danger,
            ),
            const SizedBox(width: 2),
            Text(delta, style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600,
              color: deltaPositive ? T.success : T.danger,
            )),
            const SizedBox(width: 4),
            const Text('к вчерашнему дню', style: TextStyle(fontSize: 10, color: T.muted)),
          ]),
        ],
      ]),
    );
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  static const _labels = {
    'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится',
    'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён',
  };

  Color get _color {
    return switch (status) {
      'new'       => T.accent,
      'accepted'  => const Color(0xFF60A5FA),
      'cooking'   => T.warning,
      'ready'     => T.success,
      'completed' => T.mutedDark,
      'cancelled' => T.danger,
      _           => T.muted,
    };
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(_labels[status] ?? status,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _fmtNum(double v) {
  if (v == 0) return '0';
  return v.toStringAsFixed(0).replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
