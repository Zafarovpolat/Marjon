import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:provider/provider.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../view_models/dashboard_view_model.dart';
import '../widgets/common.dart';
import 'menu/menu_page.dart';
import 'staff/staff_page.dart';
import 'orders/orders_page.dart';
import 'analytics/analytics_page.dart';
import 'finance/finance_page.dart';
import 'reports/reports_page.dart';
import 'settings/settings_page.dart';
import 'branches/branches_page.dart';
import 'printers/printers_page.dart';
import 'privacy_policy_page.dart';
import 'profile_page.dart';
import 'payment_settings_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardViewModel>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('dashboard_page'),
      backgroundColor: T.bg,
      body: IndexedStack(
        index: _tab,
        children: [
          _HomeTab(key: const ValueKey('home_tab')),
          const ReportsPage(),
          const StaffPage(),
          const MenuPage(),
          _MoreTab(key: const ValueKey('more_tab')),
        ],
      ),
      bottomNavigationBar: _buildNav(),
    );
  }

  Widget _buildNav() => Container(
    decoration: BoxDecoration(
      color: T.navBg,
      boxShadow: [
        const BoxShadow(color: Color(0x28000000), blurRadius: 20, offset: Offset(0, -4)),
      ],
    ),
    child: SafeArea(
      top: false,
      child: SizedBox(
        height: 64,
        child: Row(
          children: [
            _navItem(0, Icons.home_rounded, Icons.home_outlined, 'Дашборд'),
            _navItem(1, Icons.bar_chart_rounded, Icons.bar_chart_outlined, 'Отчёты'),
            _navItem(2, Icons.people_rounded, Icons.people_outline, 'Персонал'),
            _navItem(3, Icons.restaurant_menu_rounded, Icons.restaurant_menu_outlined, 'Меню'),
            _navItem(4, Icons.more_horiz_rounded, Icons.more_horiz_outlined, 'Ещё'),
          ],
        ),
      ),
    ),
  );

  Widget _navItem(int index, IconData activeIcon, IconData icon, String label) {
    final active = _tab == index;
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _tab = index),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(active ? activeIcon : icon,
            size: 22,
            color: active ? T.navSelected : T.navUnselected),
          const SizedBox(height: 3),
          Text(label, style: TextStyle(
            fontSize: 10, fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            color: active ? T.navSelected : T.navUnselected)),
        ]),
      ),
    );
  }
}

// ── Home Tab ──────────────────────────────────────────────────────────────────

class _HomeTab extends StatelessWidget {
  const _HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<DashboardViewModel>();
    return RefreshIndicator(
      color: T.accent,
      backgroundColor: T.surface,
      onRefresh: vm.load,
      child: CustomScrollView(slivers: [
        SliverToBoxAdapter(child: _Header(vm: vm)),
        if (vm.loading)
          const SliverFillRemaining(child: LoadingCenter())
        else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            sliver: SliverToBoxAdapter(child: _KpiGrid(vm: vm)),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(child: _ChartSection(vm: vm)),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(child: _InventoryRow(vm: vm)),
          ),
          if (vm.topDishes.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              sliver: SliverToBoxAdapter(child: _TopDishes(vm: vm)),
            ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(child: _RecentOrders(vm: vm)),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ]),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  final DashboardViewModel vm;
  const _Header({required this.vm});

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: T.surface,
      boxShadow: [
        BoxShadow(color: const Color(0x0A071428), blurRadius: 8, offset: const Offset(0, 2)),
      ],
    ),
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
        child: Row(children: [
          _DatePill(
            date: vm.date,
            onPrev: vm.prevDay,
            onNext: vm.nextDay,
            onPick: () async {
              final picked = await showDatePicker(
                context: context, initialDate: vm.date,
                firstDate: DateTime(2024), lastDate: DateTime.now(),
                builder: (_, w) => Theme(
                  data: ThemeData.light().copyWith(
                    colorScheme: const ColorScheme.light(primary: T.accent)),
                  child: w!),
              );
              if (picked != null) vm.pickDay(picked);
            },
          ),
          const Spacer(),
          _iconBtn(Icons.sync_outlined, vm.load),
          const SizedBox(width: 8),
          _iconBtn(Icons.notifications_outlined, () => _showNotifications(context)),
          const SizedBox(width: 8),
          _profileBtn(context),
        ]),
      ),
    ),
  );

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 38, height: 38, alignment: Alignment.center,
      decoration: BoxDecoration(
        color: T.bg,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: T.border),
      ),
      child: Icon(icon, size: 19, color: T.muted),
    ),
  );

  Widget _profileBtn(BuildContext context) => GestureDetector(
    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfilePage())),
    child: Container(
      width: 38, height: 38, alignment: Alignment.center,
      decoration: BoxDecoration(
        color: T.accent,
        borderRadius: BorderRadius.circular(11),
      ),
      child: const Icon(Icons.person_outline, size: 19, color: Colors.white),
    ),
  );

  void _showNotifications(BuildContext context) => showModalBottomSheet(
    context: context,
    backgroundColor: T.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => SizedBox(
      height: 280,
      child: Column(children: [
        const SizedBox(height: 14),
        Container(width: 40, height: 4,
          decoration: BoxDecoration(color: T.border, borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 20),
        const Text('Уведомления',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
        const SizedBox(height: 40),
        Icon(Icons.notifications_off_outlined, size: 44, color: T.border),
        const SizedBox(height: 12),
        const Text('Нет новых уведомлений', style: TextStyle(color: T.muted, fontSize: 14)),
      ]),
    ),
  );
}

// ── Date Pill ─────────────────────────────────────────────────────────────────

class _DatePill extends StatelessWidget {
  final DateTime date;
  final VoidCallback onPrev, onNext, onPick;
  const _DatePill({required this.date, required this.onPrev, required this.onNext, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final isToday = fmtIsoDate(date) == fmtIsoDate(DateTime.now());
    return Row(mainAxisSize: MainAxisSize.min, children: [
      _navBtn(Icons.chevron_left, onPrev),
      const SizedBox(width: 6),
      GestureDetector(
        onTap: onPick,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: isToday ? T.accent : T.bg,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: isToday ? T.accent : T.border),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.calendar_today_outlined, size: 13,
              color: isToday ? Colors.white : T.muted),
            const SizedBox(width: 7),
            Text(
              '${date.day.toString().padLeft(2,'0')}.${date.month.toString().padLeft(2,'0')}.${date.year}',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                color: isToday ? Colors.white : T.text)),
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
      width: 34, height: 34, alignment: Alignment.center,
      decoration: BoxDecoration(
        color: T.bg, borderRadius: BorderRadius.circular(9),
        border: Border.all(color: T.border)),
      child: Icon(icon, size: 18, color: T.muted),
    ),
  );
}

// ── KPI Grid ──────────────────────────────────────────────────────────────────

class _KpiGrid extends StatelessWidget {
  final DashboardViewModel vm;
  const _KpiGrid({required this.vm});

  @override
  Widget build(BuildContext context) {
    final revDelta = vm.delta(vm.revenue, vm.yRevenue);
    final ordDelta = vm.delta(vm.ordersCount.toDouble(), vm.yOrdersCount.toDouble());
    final dateLbl  = '${vm.date.day.toString().padLeft(2,'0')}.${vm.date.month.toString().padLeft(2,'0')}.${vm.date.year}';

    final cards = [
      _KpiCard(
        label: 'ВЫРУЧКА ЗА ДЕНЬ', value: fmtNum(vm.revenue), unit: 'UZS',
        tag: dateLbl, tagColor: T.accent, icon: Icons.trending_up_rounded, iconBg: T.accent,
        delta: revDelta, positive: vm.positive(vm.revenue, vm.yRevenue),
      ),
      _KpiCard(
        label: 'ЗАКАЗОВ', value: '${vm.ordersCount}',
        tag: 'Live', tagColor: T.danger, icon: Icons.receipt_long_outlined, iconBg: T.danger,
        delta: ordDelta, positive: vm.positive(vm.ordersCount.toDouble(), vm.yOrdersCount.toDouble()),
      ),
      _KpiCard(
        label: 'СРЕДНИЙ ЧЕК', value: fmtNum(vm.avgCheck), unit: 'UZS',
        tag: 'Среднее', tagColor: T.warning, icon: Icons.receipt_outlined, iconBg: T.warning,
      ),
      _KpiCard(
        label: 'ДЕНЕЖНЫЙ ПРИХОД', value: fmtNum(vm.incomeTotal), unit: 'UZS',
        tag: 'Приход', tagColor: T.success, icon: Icons.arrow_circle_down_outlined, iconBg: T.success,
      ),
      _KpiCard(
        label: 'ДЕНЕЖНЫЕ РАСХОДЫ', value: fmtNum(vm.expenseTotal), unit: 'UZS',
        tag: 'Расход', tagColor: T.orange, icon: Icons.arrow_circle_up_outlined, iconBg: T.orange,
      ),
    ];

    return Column(children: [
      // First two full-width 50/50
      Row(children: [
        Expanded(child: cards[0]),
        const SizedBox(width: 10),
        Expanded(child: cards[1]),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: cards[2]),
        const SizedBox(width: 10),
        Expanded(child: cards[3]),
      ]),
      const SizedBox(height: 10),
      // Fifth card full width
      cards[4],
    ]);
  }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label, value;
  final String? unit, delta;
  final String tag;
  final Color tagColor, iconBg;
  final IconData icon;
  final bool? positive;

  const _KpiCard({
    required this.label, required this.value, this.unit,
    required this.tag, required this.tagColor, required this.iconBg, required this.icon,
    this.delta, this.positive,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: T.surface,
      borderRadius: BorderRadius.circular(18),
      boxShadow: T.cardShadow,
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34, height: 34, alignment: Alignment.center,
          decoration: BoxDecoration(
            color: iconBg.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 17, color: iconBg),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: tagColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text(tag,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: tagColor),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ]),
      const SizedBox(height: 12),
      Text(label,
        maxLines: 1, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 10, color: T.muted,
          fontWeight: FontWeight.w600, letterSpacing: 0.3)),
      const SizedBox(height: 6),
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Text(value,
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: T.text))),
        if (unit != null) Padding(
          padding: const EdgeInsets.only(bottom: 3, left: 4),
          child: Text(unit!,
            style: const TextStyle(fontSize: 11, color: T.muted, fontWeight: FontWeight.w500))),
      ]),
      if (delta != null && delta!.isNotEmpty) ...[
        const SizedBox(height: 6),
        Row(children: [
          Icon(
            (positive ?? true) ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
            size: 12, color: (positive ?? true) ? T.success : T.danger),
          const SizedBox(width: 2),
          Text(delta!, style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: (positive ?? true) ? T.success : T.danger)),
          const SizedBox(width: 4),
          const Flexible(child: Text('к вчера', maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10, color: T.muted))),
        ]),
      ],
    ]),
  );
}

// ── Chart Section ─────────────────────────────────────────────────────────────

class _ChartSection extends StatelessWidget {
  final DashboardViewModel vm;
  const _ChartSection({required this.vm});

  @override
  Widget build(BuildContext context) {
    final valid  = vm.chartData.where((v) => v > 0).toList();
    final maxVal = valid.isEmpty ? 1.0 : valid.reduce((a, b) => a > b ? a : b);
    final minVal = valid.isEmpty ? 0.0 : valid.reduce((a, b) => a < b ? a : b);
    final avgVal = valid.isEmpty ? 0.0 : valid.fold(0.0, (s, v) => s + v) / valid.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: T.cardShadow,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('REVENUE ANALYTICS',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                color: T.muted, letterSpacing: 0.8)),
            SizedBox(height: 2),
            Text('Выручка за 7 дней',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
          ]),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsPage())),
            child: const Text('Подробнее',
              style: TextStyle(fontSize: 13, color: T.accent, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 4),
        Text(
          _periodLabel(vm.date, vm.chartDays),
          style: const TextStyle(fontSize: 11, color: T.muted),
        ),
        const SizedBox(height: 12),
        // Period chips
        Row(children: [
          _PeriodChip(days: 7, current: vm.chartDays, vm: vm),
          const SizedBox(width: 8),
          _PeriodChip(days: 30, current: vm.chartDays, vm: vm),
        ]),
        const SizedBox(height: 16),
        // Stats
        Row(children: [
          _chartStat('Максимум', maxVal),
          const SizedBox(width: 8),
          _chartStat('Минимум', minVal),
          const SizedBox(width: 8),
          _chartStat('Среднее', avgVal),
        ]),
        const SizedBox(height: 16),
        SizedBox(height: 175, child: _LineChart(data: vm.chartData, days: vm.chartDays, baseDate: vm.date)),
      ]),
    );
  }

  String _periodLabel(DateTime date, int days) {
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    final from = date.subtract(Duration(days: days - 1));
    return 'Период ${from.day} ${months[from.month-1]} - ${date.day} ${months[date.month-1]} ${date.year}';
  }

  Widget _chartStat(String label, double val) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: T.bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 10, color: T.muted, fontWeight: FontWeight.w500)),
        const SizedBox(height: 4),
        Text(fmtNum(val, compact: true),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
        const Text('UZS', style: TextStyle(fontSize: 9, color: T.muted)),
      ]),
    ),
  );
}

class _PeriodChip extends StatelessWidget {
  final int days, current;
  final DashboardViewModel vm;
  const _PeriodChip({required this.days, required this.current, required this.vm});

  @override
  Widget build(BuildContext context) {
    final active = days == current;
    return GestureDetector(
      onTap: () => vm.setChartDays(days),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? T.accent.withValues(alpha: 0.1) : T.bg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? T.accent : T.border, width: active ? 1.5 : 1),
        ),
        child: Text(
          active
            ? '${_periodShort(vm.date, days)} ↓'
            : (days == 7 ? '7 дней' : '30 дней'),
          style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: active ? T.accent : T.muted)),
      ),
    );
  }

  String _periodShort(DateTime date, int days) {
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    final from = date.subtract(Duration(days: days - 1));
    return '${from.day} ${months[from.month-1]} - ${date.day} ${months[date.month-1]} ${date.year}';
  }
}

// ── Inventory Row ─────────────────────────────────────────────────────────────

class _InventoryRow extends StatelessWidget {
  final DashboardViewModel vm;
  const _InventoryRow({required this.vm});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _inventoryTile(
        Icons.download_outlined, T.blueLight, T.blueLight.withValues(alpha: 0.1),
        'Приход товаров', '${fmtNum(vm.incomeTotal, compact: true)} UZS',
      ),
      const SizedBox(height: 8),
      _inventoryTile(
        Icons.upload_outlined, T.orange, T.orange.withValues(alpha: 0.1),
        'Расход товаров', '${fmtNum(vm.expenseTotal, compact: true)} UZS',
      ),
      const SizedBox(height: 8),
      _inventoryTile(
        Icons.inventory_2_outlined, T.success, T.success.withValues(alpha: 0.1),
        'Остаток склада', '—',
      ),
    ],
  );

  Widget _inventoryTile(IconData icon, Color color, Color bgColor, String label, String value) =>
    Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: T.softShadow,
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40, alignment: Alignment.center,
          decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(11)),
          child: Icon(icon, size: 20, color: color),
        ),
        const SizedBox(width: 14),
        Expanded(child: Text(label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: T.text))),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
}

// ── Top Dishes ────────────────────────────────────────────────────────────────

class _TopDishes extends StatelessWidget {
  final DashboardViewModel vm;
  const _TopDishes({required this.vm});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _SectionHeader(
        label: 'Топ блюда',
        action: 'В отчёты',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsPage())),
      ),
      const SizedBox(height: 10),
      Container(
        decoration: BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.circular(18),
          boxShadow: T.cardShadow,
        ),
        child: Column(
          children: vm.topDishes.take(5).toList().asMap().entries.map((e) {
            final i = e.key;
            final d = e.value;
            final maxQty = toDouble(vm.topDishes.first['quantity']);
            final qty    = toDouble(d['quantity']);
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(children: [
                Row(children: [
                  Container(
                    width: 28, height: 28, alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == 0 ? T.accent.withValues(alpha: 0.12) : T.bg,
                      borderRadius: BorderRadius.circular(8)),
                    child: Text('${i+1}', style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 12,
                      color: i == 0 ? T.accent : T.muted))),
                  const SizedBox(width: 12),
                  Expanded(child: Text(d['name']?.toString() ?? '—',
                    style: const TextStyle(fontSize: 14, color: T.text, fontWeight: FontWeight.w500))),
                  Text('${fmtNum(qty)} шт',
                    style: const TextStyle(fontSize: 12, color: T.muted)),
                  const SizedBox(width: 10),
                  Text('${fmtNum(toDouble(d["total"]), compact: true)} UZS',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
                ]),
                if (maxQty > 0) ...[
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: qty / maxQty, minHeight: 3,
                      backgroundColor: T.bg,
                      valueColor: AlwaysStoppedAnimation(i == 0 ? T.accent : T.accent.withValues(alpha: 0.5)),
                    )),
                ],
                if (i < vm.topDishes.take(5).length - 1)
                  Divider(height: 16, color: T.border),
              ]),
            );
          }).toList(),
        ),
      ),
    ],
  );
}

// ── Recent Orders ─────────────────────────────────────────────────────────────

class _RecentOrders extends StatelessWidget {
  final DashboardViewModel vm;
  const _RecentOrders({required this.vm});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _SectionHeader(
        label: 'Последние заказы',
        action: 'Все заказы',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage())),
      ),
      const SizedBox(height: 10),
      Container(
        decoration: BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.circular(18),
          boxShadow: T.cardShadow,
        ),
        child: vm.recentOrders.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.receipt_long_outlined, size: 40, color: T.border),
                const SizedBox(height: 10),
                const Text('Нет заказов за этот день',
                  style: TextStyle(color: T.muted, fontSize: 14)),
              ]),
            )
          : Column(
              children: vm.recentOrders.take(6).toList().asMap().entries.map((e) {
                final i = e.key;
                final o = e.value;
                return Column(children: [
                  _OrderRow(order: o),
                  if (i < vm.recentOrders.take(6).length - 1)
                    Divider(height: 1, color: T.border, indent: 16, endIndent: 16),
                ]);
              }).toList(),
            ),
      ),
    ],
  );
}

class _OrderRow extends StatelessWidget {
  final Map<String, dynamic> order;
  const _OrderRow({required this.order});

  @override
  Widget build(BuildContext context) {
    final o = order;
    final orderNum  = o['order_number']?.toString() ?? '—';
    final total     = toDouble(o['total'] ?? o['total_amount']);
    final table     = o['table_number']?.toString();
    final type      = o['order_type']?.toString();
    final createdAt = o['created_at']?.toString();

    String loc = '';
    if (table != null && table != 'null') {
      loc = 'Стол $table';
    } else if (type == 'delivery') {
      loc = 'Доставка';
    } else if (type == 'takeaway') {
      loc = 'Навынос';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('#$orderNum',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
            if (createdAt != null) ...[
              const SizedBox(width: 8),
              Text(fmtDateTime(createdAt),
                style: const TextStyle(fontSize: 11, color: T.muted)),
            ],
            if (loc.isNotEmpty) ...[
              const SizedBox(width: 8),
              Text(loc, style: const TextStyle(fontSize: 11, color: T.muted)),
            ],
          ]),
          const SizedBox(height: 4),
          Text('${fmtNum(total)} UZS',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
        ])),
        const SizedBox(width: 10),
        StatusBadge(o['status']?.toString() ?? ''),
      ]),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String label, action;
  final VoidCallback onAction;
  const _SectionHeader({required this.label, required this.action, required this.onAction});

  @override
  Widget build(BuildContext context) => Row(children: [
    Text(label, style: const TextStyle(
      fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
    const Spacer(),
    GestureDetector(
      onTap: onAction,
      child: Text(action, style: const TextStyle(
        fontSize: 13, color: T.accent, fontWeight: FontWeight.w600)),
    ),
  ]);
}

// ── More Tab ──────────────────────────────────────────────────────────────────

class _MoreTab extends StatelessWidget {
  const _MoreTab({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Scaffold(
      key: const ValueKey('more_tab_scaffold'),
      backgroundColor: T.bg,
      appBar: AppBar(
        title: const Text('Ещё'),
        backgroundColor: T.surface,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: T.border)),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _section('Операции', [
          _tile(context, Icons.receipt_long_outlined, 'Заказы', 'История и статусы', T.purple,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage()))),
          _tile(context, Icons.account_balance_wallet_outlined, 'Финансы', 'Доходы и расходы', T.success,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinancePage()))),
          _tile(context, Icons.analytics_outlined, 'Аналитика', 'Динамика продаж', T.blueLight,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsPage()))),
        ]),
        _section('Управление', [
          _tile(context, Icons.person_outline, 'Профиль', 'Имя, пароль, выход', T.blueLight,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfilePage()))),
          _tile(context, Icons.payment_outlined, 'Платёжные шлюзы', 'Payme, Click, Uzum', T.accent,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PaymentSettingsPage()))),
          _tile(context, Icons.store_outlined, 'Филиалы', 'Залы и столы', T.accent,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BranchesPage()))),
          _tile(context, Icons.print_outlined, 'Принтеры', 'Настройка оборудования', T.muted,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrintersPage()))),
          _tile(context, Icons.tune_outlined, 'Настройки', 'Компания, оплата, единицы', T.warning,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()))),
          _tile(context, Icons.privacy_tip_outlined, 'Конфиденциальность', 'Политика обработки данных', T.blueLight,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyPolicyPage()))),
        ]),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: T.surface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: T.softShadow,
          ),
          child: ListTile(
            leading: Container(
              width: 40, height: 40, alignment: Alignment.center,
              decoration: BoxDecoration(
                color: T.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.logout, color: T.danger, size: 20)),
            title: const Text('Выйти',
              style: TextStyle(color: T.danger, fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: const Text('Выход из аккаунта',
              style: TextStyle(color: T.muted, fontSize: 12)),
            trailing: const Icon(Icons.chevron_right, color: T.muted, size: 20),
            onTap: state.logout,
          ),
        ),
        const SizedBox(height: 32),
      ]),
    );
  }

  Widget _section(String title, List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 10, top: 20),
        child: Text(title.toUpperCase(),
          style: const TextStyle(
            fontSize: 11, fontWeight: FontWeight.w700,
            color: T.muted, letterSpacing: 1.2)),
      ),
      Container(
        decoration: BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: T.softShadow,
        ),
        child: Column(children: [
          for (int i = 0; i < children.length; i++) ...[
            children[i],
            if (i < children.length - 1)
              Divider(height: 1, color: T.border, indent: 64),
          ],
        ]),
      ),
    ],
  );

  Widget _tile(BuildContext context, IconData icon, String label, String sub, Color color, VoidCallback onTap) =>
    ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: Container(
        width: 40, height: 40, alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 20)),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: T.text, fontSize: 14)),
      subtitle: Text(sub, style: const TextStyle(color: T.muted, fontSize: 12)),
      trailing: const Icon(Icons.chevron_right, color: T.muted, size: 20),
      onTap: onTap,
    );
}

// ── Line Chart ────────────────────────────────────────────────────────────────

class _LineChart extends StatelessWidget {
  final List<double> data;
  final int days;
  final DateTime baseDate;
  const _LineChart({required this.data, required this.days, required this.baseDate});

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) return const SizedBox.shrink();
    final spots = List.generate(data.length, (i) => FlSpot(i.toDouble(), data[i]));
    final maxY = data.reduce((a, b) => a > b ? a : b) * 1.3;

    return LineChart(LineChartData(
      minX: 0, maxX: (data.length - 1).toDouble(),
      minY: 0, maxY: maxY <= 0 ? 1.0 : maxY,
      gridData: FlGridData(
        show: true, drawVerticalLine: false,
        horizontalInterval: (maxY <= 0 ? 1.0 : maxY) / 4,
        getDrawingHorizontalLine: (_) => FlLine(color: T.border, strokeWidth: 0.8),
      ),
      borderData: FlBorderData(show: false),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => T.text,
          tooltipRoundedRadius: 10,
          getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
            '${fmtNum(s.y, compact: true)} UZS',
            const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
          )).toList(),
        ),
      ),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true, reservedSize: 44,
          getTitlesWidget: (v, _) => v == 0 ? const SizedBox.shrink()
              : Text(fmtNum(v, compact: true),
                  style: const TextStyle(color: T.muted, fontSize: 9)),
        )),
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true, reservedSize: 24,
          interval: days > 14 ? 5 : 1,
          getTitlesWidget: (v, _) {
            final d = baseDate.subtract(Duration(days: (data.length - 1) - v.toInt()));
            return Padding(padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${d.day.toString().padLeft(2,'0')}.${d.month.toString().padLeft(2,'0')}',
                style: const TextStyle(color: T.muted, fontSize: 9)));
          },
        )),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots, isCurved: true, curveSmoothness: 0.35,
          color: T.accent, barWidth: 2.5, isStrokeCapRound: true,
          dotData: FlDotData(show: true,
            getDotPainter: (s, _, __, ___) => FlDotCirclePainter(
              radius: 4, color: T.accent, strokeWidth: 2.5, strokeColor: T.surface)),
          belowBarData: BarAreaData(show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter, end: Alignment.bottomCenter,
              colors: [T.accent.withValues(alpha: 0.2), T.accent.withValues(alpha: 0.0)])),
        ),
      ],
    ));
  }
}
