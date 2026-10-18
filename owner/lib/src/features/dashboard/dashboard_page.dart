import 'package:dio/dio.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../net/api.dart';
import '../../session.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../reports/reports_pages.dart';

class _Data {
  _Data(this.dash, this.yesterday, this.sales, this.top, this.income, this.expense);
  final Json dash;
  final Json yesterday;
  final List<Json> sales;
  final List<Json> top;
  final num income;
  final num expense;
}

const _months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

String _delta(num today, num yesterday) {
  if (yesterday == 0) return today > 0 ? '+100%' : '0%';
  final pct = ((today - yesterday) / yesterday * 100).round();
  return '${pct >= 0 ? '+' : ''}$pct%';
}

bool _positive(num today, num yesterday) => today >= yesterday;

/// Owner dashboard: date-pill header, KPI cards with day-over-day deltas,
/// revenue analytics chart (7/30 days), top dishes of the day.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  DateTime day = DateTime.now();
  int chartDays = 7;

  Future<_Data> _load() async {
    final d = isoDate(day);
    final yd = isoDate(day.subtract(const Duration(days: 1)));
    final from = isoDate(day.subtract(Duration(days: chartDays - 1)));
    final r = await Future.wait<dynamic>([
      Api.i.get('/analytics/dashboard', query: {'date': d}),
      Api.i.get('/analytics/dashboard', query: {'date': yd}).catchError((_) => <String, dynamic>{}),
      Api.i.get('/analytics/sales', query: {'date_from': from, 'date_to': d}),
      Api.i.get('/analytics/products/top', query: {'date_from': d, 'date_to': d, 'limit': 5}),
      Api.i.get('/finance/transactions', query: {'date_from': d, 'date_to': d}).catchError((_) => <dynamic>[]),
    ]);
    num inc = 0, exp = 0;
    for (final t in asJsonList(r[4])) {
      final a = toNum(t['amount']);
      if (t['direction'] == 'income') {
        inc += a;
      } else {
        exp += a;
      }
    }
    return _Data(asJson(r[0]), asJson(r[1]), asJsonList(r[2]), asJsonList(r[3]), inc, exp);
  }

  Future<void> _pickDay() async {
    final p = await showDatePicker(context: context, initialDate: day, firstDate: DateTime(2023), lastDate: DateTime.now());
    if (p != null) setState(() => day = p);
  }

  void _showNotifications() => showModalBottomSheet(
        context: context,
        backgroundColor: MC.card,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => SizedBox(
          height: 260,
          child: Column(children: [
            const SizedBox(height: 14),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.border, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 20),
            Text('Уведомления', style: MT.title),
            const SizedBox(height: 40),
            const Icon(Icons.notifications_off_outlined, size: 44, color: MC.n300),
            const SizedBox(height: 12),
            Text('Нет новых уведомлений', style: MT.bodyMuted),
          ]),
        ),
      );

  void _showProfile(Session s) => showModalBottomSheet(
        context: context,
        backgroundColor: MC.card,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.border, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 20),
              Row(children: [
                Avatar(s.displayName, size: 46),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.displayName, style: MT.body.copyWith(fontWeight: FontWeight.w700)),
                    Text('Владелец', style: MT.small),
                  ]),
                ),
              ]),
              const SizedBox(height: 16),
              GhostButton(
                label: 'Выйти',
                icon: Icons.logout,
                onPressed: () async {
                  Navigator.pop(context);
                  if (await confirm(context, 'Выйти из аккаунта?', action: 'Выйти', danger: false)) {
                    await s.logout();
                  }
                },
              ),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      backgroundColor: MC.bg,
      body: AsyncBody<_Data>(
        reloadKey: (isoDate(day), chartDays),
        load: _load,
        builder: (_, d, reload) => RefreshIndicator(
          onRefresh: reload,
          child: CustomScrollView(slivers: [
            SliverToBoxAdapter(child: _Header(day: day, onPrev: () => setState(() => day = day.subtract(const Duration(days: 1))), onNext: () {
              final next = day.add(const Duration(days: 1));
              if (!next.isAfter(DateTime.now())) setState(() => day = next);
            }, onPick: _pickDay, onRefresh: reload, onBell: _showNotifications, onProfile: () => _showProfile(s))),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              sliver: SliverToBoxAdapter(child: _KpiGrid(dash: d.dash, yesterday: d.yesterday, income: d.income, expense: d.expense, day: day)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              sliver: SliverToBoxAdapter(child: _TopStrip()),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              sliver: SliverToBoxAdapter(
                child: _ChartSection(
                  rows: d.sales,
                  day: day,
                  chartDays: chartDays,
                  onPickDays: (v) => setState(() => chartDays = v),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              sliver: SliverToBoxAdapter(child: _TopDishes(top: d.top)),
            ),
          ]),
        ),
      ),
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.day, required this.onPrev, required this.onNext, required this.onPick, required this.onRefresh, required this.onBell, required this.onProfile});
  final DateTime day;
  final VoidCallback onPrev, onNext, onPick, onBell, onProfile;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(color: MC.card, border: Border(bottom: BorderSide(color: MC.borderLight))),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: Row(children: [
              _DatePill(date: day, onPrev: onPrev, onNext: onNext, onPick: onPick),
              const Spacer(),
              _iconBtn(Icons.sync_outlined, () => onRefresh()),
              const SizedBox(width: 8),
              _iconBtn(Icons.notifications_outlined, onBell),
              const SizedBox(width: 8),
              _profileBtn(),
            ]),
          ),
        ),
      );

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: MC.bg, borderRadius: BorderRadius.circular(11), border: Border.all(color: MC.border)),
          child: Icon(icon, size: 19, color: MC.textMuted),
        ),
      );

  Widget _profileBtn() => GestureDetector(
        onTap: onProfile,
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: MC.teal500, borderRadius: BorderRadius.circular(11)),
          child: const Icon(Icons.person_outline, size: 19, color: Colors.white),
        ),
      );
}

class _DatePill extends StatelessWidget {
  const _DatePill({required this.date, required this.onPrev, required this.onNext, required this.onPick});
  final DateTime date;
  final VoidCallback onPrev, onNext, onPick;

  @override
  Widget build(BuildContext context) {
    final isToday = isoDate(date) == isoDate(DateTime.now());
    return Row(mainAxisSize: MainAxisSize.min, children: [
      _navBtn(Icons.chevron_left, onPrev),
      const SizedBox(width: 6),
      GestureDetector(
        onTap: onPick,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: isToday ? MC.teal500 : MC.bg,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: isToday ? MC.teal500 : MC.border),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.calendar_today_outlined, size: 13, color: isToday ? Colors.white : MC.textMuted),
            const SizedBox(width: 7),
            Text(fmtDate(date), style: TextStyle(fontFamily: MC.fontDisplay, fontSize: 14, fontWeight: FontWeight.w700, color: isToday ? Colors.white : MC.textPrimary)),
          ]),
        ),
      ),
      const SizedBox(width: 6),
      _navBtn(Icons.chevron_right, onNext),
    ]);
  }

  Widget _navBtn(IconData icon, VoidCallback fn) => GestureDetector(
        onTap: fn,
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: MC.bg, borderRadius: BorderRadius.circular(9), border: Border.all(color: MC.border)),
          child: Icon(icon, size: 18, color: MC.textMuted),
        ),
      );
}

// ── KPI grid ─────────────────────────────────────────────────────────────

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.dash, required this.yesterday, required this.income, required this.expense, required this.day});
  final Json dash;
  final Json yesterday;
  final num income;
  final num expense;
  final DateTime day;

  @override
  Widget build(BuildContext context) {
    final revenue = toNum(dash['today_revenue']);
    final yRevenue = toNum(yesterday['today_revenue']);
    final orders = toNum(dash['today_orders']);
    final yOrders = toNum(yesterday['today_orders']);

    final cards = [
      _KpiCard(
        label: 'ВЫРУЧКА ЗА ДЕНЬ',
        value: fmtMoney(revenue),
        tag: fmtDate(day),
        tagColor: MC.teal600,
        icon: Icons.trending_up_rounded,
        iconColor: MC.teal600,
        delta: _delta(revenue, yRevenue),
        positive: _positive(revenue, yRevenue),
      ),
      _KpiCard(
        label: 'ЗАКАЗОВ',
        value: '${dash['today_orders'] ?? 0}',
        tag: 'Live',
        tagColor: MC.red600,
        icon: Icons.receipt_long_outlined,
        iconColor: MC.blue600,
        delta: _delta(orders, yOrders),
        positive: _positive(orders, yOrders),
      ),
      _KpiCard(
        label: 'СРЕДНИЙ ЧЕК',
        value: fmtNum(toNum(dash['avg_check'])),
        tag: 'Среднее',
        tagColor: MC.amber700,
        icon: Icons.receipt_outlined,
        iconColor: MC.purple500,
      ),
      _KpiCard(
        label: 'ДЕНЕЖНЫЙ ПРИХОД',
        value: fmtNum(income),
        tag: 'Приход',
        tagColor: MC.green600,
        icon: Icons.arrow_circle_down_outlined,
        iconColor: MC.green500,
      ),
      _KpiCard(
        label: 'ДЕНЕЖНЫЕ РАСХОДЫ',
        value: fmtNum(expense),
        tag: 'Расход',
        tagColor: MC.red600,
        icon: Icons.arrow_circle_up_outlined,
        iconColor: MC.red500,
      ),
    ];

    return Column(children: [
      Row(children: [Expanded(child: cards[0]), const SizedBox(width: 10), Expanded(child: cards[1])]),
      const SizedBox(height: 10),
      Row(children: [Expanded(child: cards[2]), const SizedBox(width: 10), Expanded(child: cards[3])]),
      const SizedBox(height: 10),
      cards[4],
    ]);
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.label, required this.value, required this.tag, required this.tagColor, required this.iconColor, required this.icon, this.delta, this.positive});
  final String label, value;
  final String tag;
  final Color tagColor, iconColor;
  final IconData icon;
  final String? delta;
  final bool? positive;

  @override
  Widget build(BuildContext context) => Card2(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 16, color: iconColor),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: tagColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(7)),
              child: Text(tag, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: tagColor), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ]),
          const SizedBox(height: 12),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: MT.small.copyWith(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: MT.h2.copyWith(fontSize: 22)),
          ),
          if (delta != null && delta!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(children: [
              Icon((positive ?? true) ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, size: 12, color: (positive ?? true) ? MC.green600 : MC.red600),
              const SizedBox(width: 2),
              Text(delta!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: (positive ?? true) ? MC.green600 : MC.red600)),
              const SizedBox(width: 4),
              const Flexible(child: Text('к вчера', maxLines: 1, overflow: TextOverflow.ellipsis, style: MT.small)),
            ]),
          ],
        ]),
      );
}

// ── Chart section ────────────────────────────────────────────────────────

class _ChartSection extends StatelessWidget {
  const _ChartSection({required this.rows, required this.day, required this.chartDays, required this.onPickDays});
  final List<Json> rows;
  final DateTime day;
  final int chartDays;
  final ValueChanged<int> onPickDays;

  @override
  Widget build(BuildContext context) {
    final values = rows.map((r) => toNum(r['revenue']).toDouble()).toList();
    final valid = values.where((v) => v > 0).toList();
    final maxVal = valid.isEmpty ? 0.0 : valid.reduce((a, b) => a > b ? a : b);
    final minVal = valid.isEmpty ? 0.0 : valid.reduce((a, b) => a < b ? a : b);
    final avgVal = valid.isEmpty ? 0.0 : valid.fold(0.0, (s, v) => s + v) / valid.length;
    final from = day.subtract(Duration(days: chartDays - 1));

    return Card2(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ВЫРУЧКА', style: MT.small.copyWith(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
              const SizedBox(height: 2),
              Text('Выручка за $chartDays дней', style: MT.title.copyWith(fontSize: 16)),
            ]),
          ),
          GestureDetector(
            onTap: () => push(context, const ReportsHubPage()),
            child: Text('Подробнее', style: MT.body.copyWith(fontSize: 13, color: MC.teal600, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 4),
        Text('Период ${from.day} ${_months[from.month - 1]} - ${day.day} ${_months[day.month - 1]} ${day.year}', style: MT.small),
        const SizedBox(height: 12),
        Row(children: [
          _PeriodChip(days: 7, label: '7 дней', current: chartDays, onTap: onPickDays),
          const SizedBox(width: 8),
          _PeriodChip(days: 30, label: '30 дней', current: chartDays, onTap: onPickDays),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          _chartStat('Максимум', maxVal),
          const SizedBox(width: 8),
          _chartStat('Минимум', minVal),
          const SizedBox(width: 8),
          _chartStat('Среднее', avgVal),
        ]),
        const SizedBox(height: 16),
        SizedBox(height: 175, child: _LineChart(rows: rows, baseDate: day)),
      ]),
    );
  }

  Widget _chartStat(String label, double val) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(color: MC.bg, borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: MT.small.copyWith(fontSize: 10)),
            const SizedBox(height: 4),
            Text(fmtNum(val), style: MT.body.copyWith(fontSize: 13, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
      );
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({required this.days, required this.label, required this.current, required this.onTap});
  final int days, current;
  final String label;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final active = days == current;
    return GestureDetector(
      onTap: () => onTap(days),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? MC.brandBg : MC.bg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? MC.teal500 : MC.border, width: active ? 1.5 : 1),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: active ? MC.teal700 : MC.textMuted)),
      ),
    );
  }
}

class _LineChart extends StatelessWidget {
  const _LineChart({required this.rows, required this.baseDate});
  final List<Json> rows;
  final DateTime baseDate;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return Center(child: Text('Нет данных', style: MT.bodyMuted));
    final data = rows.map((r) => toNum(r['revenue']).toDouble()).toList();
    final spots = List.generate(data.length, (i) => FlSpot(i.toDouble(), data[i]));
    final maxRaw = data.reduce((a, b) => a > b ? a : b);
    final maxY = maxRaw <= 0 ? 1.0 : maxRaw * 1.3;

    return LineChart(LineChartData(
      minX: 0,
      maxX: (data.length - 1).toDouble().clamp(0, double.infinity),
      minY: 0,
      maxY: maxY,
      gridData: FlGridData(show: true, drawVerticalLine: false, horizontalInterval: maxY / 4, getDrawingHorizontalLine: (_) => const FlLine(color: MC.n100, strokeWidth: 0.8)),
      borderData: FlBorderData(show: false),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => MC.n900,
          tooltipRoundedRadius: 10,
          getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(fmtMoney(s.y), const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12))).toList(),
        ),
      ),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 44,
            getTitlesWidget: (v, _) => v == 0 ? const SizedBox.shrink() : Text(fmtNum(v), style: MT.small.copyWith(fontSize: 9)),
          ),
        ),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 24,
            interval: rows.length > 14 ? 5 : 1,
            getTitlesWidget: (v, _) {
              final i = v.toInt();
              if (i < 0 || i >= rows.length) return const SizedBox();
              final s = '${rows[i]['date']}';
              final lbl = s.length >= 10 ? '${s.substring(8, 10)}.${s.substring(5, 7)}' : s;
              return Padding(padding: const EdgeInsets.only(top: 6), child: Text(lbl, style: MT.small.copyWith(fontSize: 9)));
            },
          ),
        ),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots,
          isCurved: true,
          curveSmoothness: 0.35,
          color: MC.teal500,
          barWidth: 2.5,
          isStrokeCapRound: true,
          dotData: FlDotData(show: true, getDotPainter: (s, _, __, ___) => FlDotCirclePainter(radius: 4, color: MC.teal500, strokeWidth: 2.5, strokeColor: MC.card)),
          belowBarData: BarAreaData(show: true, gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [MC.teal500.withValues(alpha: 0.2), MC.teal500.withValues(alpha: 0.0)])),
        ),
      ],
    ));
  }
}

// ── Top dishes ───────────────────────────────────────────────────────────

class _TopDishes extends StatelessWidget {
  const _TopDishes({required this.top});
  final List<Json> top;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(
            'Топ блюд дня',
            trailing: GestureDetector(
              onTap: () => push(context, const ReportsHubPage()),
              child: Text('В отчёты', style: MT.body.copyWith(fontSize: 13, color: MC.teal600, fontWeight: FontWeight.w600)),
            ),
          ),
          if (top.isEmpty)
            const Card2(child: Text('Продаж за этот день нет', style: MT.bodyMuted))
          else
            Card2(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < top.length; i++) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Column(children: [
                        Row(children: [
                          Container(
                            width: 28,
                            height: 28,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: i == 0 ? MC.brandBg : MC.bg, borderRadius: BorderRadius.circular(8)),
                            child: Text('${i + 1}', style: TextStyle(fontFamily: MC.fontDisplay, fontWeight: FontWeight.w700, fontSize: 12, color: i == 0 ? MC.teal700 : MC.textMuted)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(child: Text('${top[i]['name']}', style: MT.body.copyWith(fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          Text('×${fmtNum(toNum(top[i]['quantity_sold']))}', style: MT.small),
                          const SizedBox(width: 10),
                          Text(fmtMoney(toNum(top[i]['revenue'])), style: MT.money),
                        ]),
                        if (toNum(top.first['quantity_sold']) > 0) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: toNum(top[i]['quantity_sold']) / toNum(top.first['quantity_sold']),
                              minHeight: 3,
                              backgroundColor: MC.bg,
                              valueColor: AlwaysStoppedAnimation(i == 0 ? MC.teal500 : MC.teal500.withValues(alpha: 0.5)),
                            ),
                          ),
                        ],
                      ]),
                    ),
                    if (i < top.length - 1) const Divider(height: 1, color: MC.borderLight),
                  ],
                ],
              ),
            ),
        ],
      );
}

/// Account balance (billing) and the Central Bank USD rate — the web topbar widgets.
class _TopStrip extends StatelessWidget {
  const _TopStrip();

  Future<(Json, String?)> _load() async {
    Json bal = {};
    String? rate;
    try {
      bal = asJson(await Api.i.get('/billing/balance'));
    } catch (_) {}
    try {
      final r = await (Dio(BaseOptions(connectTimeout: const Duration(seconds: 5), receiveTimeout: const Duration(seconds: 5)))..httpClientAdapter = Api.i.dio.httpClientAdapter).get('https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/');
      final d = r.data;
      if (d is List && d.isNotEmpty) rate = '${d.first['Rate']}';
    } catch (_) {}
    return (bal, rate);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<(Json, String?)>(
        future: _load(),
        builder: (_, snap) {
          final bal = snap.data?.$1 ?? {};
          final rate = snap.data?.$2;
          if (snap.data == null) return const SizedBox.shrink();
          return Row(children: [
            Expanded(child: StatTile('Баланс', fmtMoney(toNum(bal['balance'])), icon: Icons.account_balance_wallet_outlined, sub: bal['days_left'] != null && toNum(bal['days_left']) > 0 ? 'осталось ${bal['days_left']} дн.' : null)),
            const SizedBox(width: 10),
            Expanded(child: StatTile('USD, ЦБ РУз', rate == null ? '—' : rate, icon: Icons.attach_money, color: MC.blue600)),
          ]);
        },
      );
}
