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
    // Load dashboard data after widget is mounted (lazy — not in ViewModel constructor)
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

  BottomNavigationBar _buildNav() => BottomNavigationBar(
    key: const ValueKey('bottom_nav'),
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
      BottomNavigationBarItem(key: ValueKey('nav_reports'), icon: Icon(Icons.bar_chart_outlined), activeIcon: Icon(Icons.bar_chart), label: 'Отчёты'),
      BottomNavigationBarItem(icon: Icon(Icons.people_outline), activeIcon: Icon(Icons.people), label: 'Персонал'),
      BottomNavigationBarItem(icon: Icon(Icons.restaurant_menu_outlined), activeIcon: Icon(Icons.restaurant_menu), label: 'Меню'),
      BottomNavigationBarItem(icon: Icon(Icons.more_horiz), label: 'Ещё'),
    ],
  );
}

// ── Home Tab ──────────────────────────────────────────────────────────────────

class _HomeTab extends StatelessWidget {
  const _HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<DashboardViewModel>();
    return RefreshIndicator(
      color: T.accent,
      onRefresh: vm.load,
      child: CustomScrollView(slivers: [
        SliverToBoxAdapter(child: _Header(vm: vm)),
        if (vm.loading)
          const SliverFillRemaining(child: LoadingCenter())
        else ...[
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverToBoxAdapter(child: _KpiGrid(vm: vm)),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverToBoxAdapter(child: _ChartSection(vm: vm)),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverToBoxAdapter(child: _FinanceRow(vm: vm)),
          ),
          if (vm.topDishes.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverToBoxAdapter(child: _TopDishes(vm: vm)),
            ),
          if (vm.recentOrders.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverToBoxAdapter(child: _RecentOrders(vm: vm)),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
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
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
                data: ThemeData.dark().copyWith(
                  colorScheme: const ColorScheme.dark(primary: T.accent)),
                child: w!),
            );
            if (picked != null) vm.pickDay(picked);
          },
        ),
        const Spacer(),
        _iconBtn(Icons.notifications_outlined, () => _showNotifications(context)),
        const SizedBox(width: 8),
        _iconBtn(Icons.settings_outlined,
          () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()))),
      ]),
    ),
  );

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 36, height: 36, alignment: Alignment.center,
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(10),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Icon(icon, size: 19, color: T.muted),
    ),
  );

  void _showNotifications(BuildContext context) => showModalBottomSheet(
    context: context,
    builder: (_) => SizedBox(
      height: 260,
      child: Column(children: [
        const SizedBox(height: 12),
        Container(width: 40, height: 4,
          decoration: BoxDecoration(color: T.border, borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),
        const Text('Уведомления', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: T.text)),
        const SizedBox(height: 32),
        const Icon(Icons.notifications_off_outlined, size: 40, color: T.border),
        const SizedBox(height: 12),
        const Text('Нет новых уведомлений', style: TextStyle(color: T.muted)),
      ]),
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
      _KpiCard(label: 'ВЫРУЧКА ЗА ДЕНЬ', value: fmtNum(vm.revenue), unit: 'UZS',
        tag: dateLbl, tagColor: T.accent, icon: Icons.trending_up_rounded,
        delta: revDelta, positive: vm.positive(vm.revenue, vm.yRevenue)),
      _KpiCard(label: 'ЗАКАЗОВ', value: '${vm.ordersCount}',
        tag: 'Live', tagColor: T.danger, icon: Icons.receipt_long_outlined,
        delta: ordDelta, positive: vm.positive(vm.ordersCount.toDouble(), vm.yOrdersCount.toDouble())),
      _KpiCard(label: 'СРЕДНИЙ ЧЕК', value: fmtNum(vm.avgCheck), unit: 'UZS',
        tag: 'Среднее', tagColor: T.warning, icon: Icons.receipt_outlined),
      _KpiCard(label: 'ПРИХОД', value: fmtNum(vm.incomeTotal), unit: 'UZS',
        tag: 'Приход', tagColor: T.success, icon: Icons.arrow_downward_rounded),
      _KpiCard(label: 'РАСХОДЫ', value: fmtNum(vm.expenseTotal), unit: 'UZS',
        tag: 'Расход', tagColor: const Color(0xFFFB923C), icon: Icons.arrow_upward_rounded),
    ];

    return LayoutBuilder(builder: (context, constraints) {
      final cols = responsiveCols(constraints.maxWidth);
      return _KpiGridLayout(cards: cards, cols: cols);
    });
  }
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

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader('Аналитика выручки', action: 'Подробнее',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsPage()))),
      Row(children: [
        _PeriodChip(label: '7 дней', days: 7, current: vm.chartDays, vm: vm),
        const SizedBox(width: 8),
        _PeriodChip(label: '30 дней', days: 30, current: vm.chartDays, vm: vm),
      ]),
      const SizedBox(height: 14),
      Row(children: [
        _chartStat('Максимум', maxVal),
        const SizedBox(width: 8),
        _chartStat('Минимум', minVal),
        const SizedBox(width: 8),
        _chartStat('Среднее', avgVal),
      ]),
      const SizedBox(height: 16),
      SizedBox(height: 175, child: _LineChart(data: vm.chartData, days: vm.chartDays, baseDate: vm.date)),
    ]);
  }

  Widget _chartStat(String label, double val) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 10, color: T.muted)),
        const SizedBox(height: 3),
        Text(fmtNum(val, compact: true),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
      ]),
    ),
  );
}

class _PeriodChip extends StatelessWidget {
  final String label;
  final int days, current;
  final DashboardViewModel vm;
  const _PeriodChip({required this.label, required this.days, required this.current, required this.vm});

  @override
  Widget build(BuildContext context) {
    final active = days == current;
    return GestureDetector(
      onTap: () => vm.setChartDays(days),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? T.accent : T.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? T.accent : T.border),
        ),
        child: Text(label, style: TextStyle(
          fontSize: 12, fontWeight: FontWeight.w600,
          color: active ? Colors.white : T.muted)),
      ),
    );
  }
}

// ── Finance row ───────────────────────────────────────────────────────────────

class _FinanceRow extends StatelessWidget {
  final DashboardViewModel vm;
  const _FinanceRow({required this.vm});

  @override
  Widget build(BuildContext context) => Column(children: [
    SectionHeader('Финансы', action: 'Все',
      onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinancePage()))),
    Row(children: [
      Expanded(child: MCard(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinancePage())),
        child: Row(children: [
          Container(width: 38, height: 38, alignment: Alignment.center,
            decoration: BoxDecoration(color: T.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.download_outlined, color: T.success, size: 20)),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Доходы', style: TextStyle(fontSize: 11, color: T.muted)),
            Text(fmtNum(vm.incomeTotal, compact: true),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: T.success)),
          ])),
        ]),
      )),
      const SizedBox(width: 10),
      Expanded(child: MCard(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinancePage())),
        child: Row(children: [
          Container(width: 38, height: 38, alignment: Alignment.center,
            decoration: BoxDecoration(color: T.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.upload_outlined, color: T.danger, size: 20)),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Расходы', style: TextStyle(fontSize: 11, color: T.muted)),
            Text(fmtNum(vm.expenseTotal, compact: true),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: T.danger)),
          ])),
        ]),
      )),
    ]),
  ]);
}

// ── Top Dishes ────────────────────────────────────────────────────────────────

class _TopDishes extends StatelessWidget {
  final DashboardViewModel vm;
  const _TopDishes({required this.vm});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SectionHeader('Топ блюда', action: 'В отчёты',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsPage()))),
      ...vm.topDishes.take(5).toList().asMap().entries.map((e) {
        final i = e.key; final d = e.value;
        final maxQty = toDouble(vm.topDishes.first['quantity']);
        final qty = toDouble(d['quantity']);
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: T.surface, borderRadius: BorderRadius.circular(12),
            border: Border.all(color: T.border, width: 0.5),
          ),
          child: Column(children: [
            Row(children: [
              Container(width: 28, height: 28, alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: i == 0 ? T.accent.withValues(alpha: 0.15) : T.surfaceLight,
                  borderRadius: BorderRadius.circular(7)),
                child: Text('${i + 1}', style: TextStyle(
                  fontWeight: FontWeight.bold, fontSize: 12,
                  color: i == 0 ? T.accent : T.muted))),
              const SizedBox(width: 10),
              Expanded(child: Text(d['name']?.toString() ?? '—',
                style: const TextStyle(fontSize: 14, color: T.text, fontWeight: FontWeight.w500))),
              Text('${fmtNum(qty)} шт', style: const TextStyle(fontSize: 12, color: T.muted)),
              const SizedBox(width: 8),
              Text('${fmtNum(toDouble(d['total']), compact: true)} UZS',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
            ]),
            if (maxQty > 0) ...[
              const SizedBox(height: 8),
              ClipRRect(borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: qty / maxQty, backgroundColor: T.surfaceLight,
                  color: i == 0 ? T.accent : T.accentDark, minHeight: 3)),
            ],
          ]),
        );
      }),
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
      SectionHeader('Последние заказы', action: 'Все заказы',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage()))),
      ...vm.recentOrders.take(6).map((o) => _OrderRow(order: o)),
    ],
  );
}

class _OrderRow extends StatelessWidget {
  final Map<String, dynamic> order;
  const _OrderRow({required this.order});

  @override
  Widget build(BuildContext context) {
    final o = order;
    final orderNum = o['order_number']?.toString() ?? '—';
    final total = toDouble(o['total'] ?? o['total_amount']);
    final table = o['table_number']?.toString();
    final type  = o['order_type']?.toString();
    final createdAt = o['created_at']?.toString();

    String loc = '';
    if (table != null && table != 'null') {
      loc = 'Стол $table';
    } else if (type == 'delivery') {
      loc = 'Доставка';
    } else if (type == 'takeaway') {
      loc = 'Навынос';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('#$orderNum',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: T.text)),
            if (createdAt != null) ...[
              const SizedBox(width: 8),
              Text(fmtDateTime(createdAt), style: const TextStyle(fontSize: 11, color: T.muted)),
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
        const SizedBox(width: 8),
        StatusBadge(o['status']?.toString() ?? ''),
      ]),
    );
  }
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
      appBar: AppBar(title: const Text('Ещё')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _section('Операции', [
          _tile(context, Icons.receipt_long, 'Заказы', 'История и статусы', T.purple,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersPage()))),
          _tile(context, Icons.account_balance_wallet_outlined, 'Финансы', 'Доходы и расходы', T.success,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinancePage()))),
          _tile(context, Icons.analytics_outlined, 'Аналитика', 'Динамика продаж', T.blueLight,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsPage()))),
        ]),
        _section('Управление', [
          _tile(context, Icons.person_outline, 'Профиль', 'Имя, пароль, выход', T.blueLight,
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfilePage()))),
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
        MCard(
          padding: EdgeInsets.zero,
          child: ListTile(
            leading: const Icon(Icons.logout, color: T.danger, size: 22),
            title: const Text('Выйти', style: TextStyle(color: T.danger, fontWeight: FontWeight.w600)),
            onTap: state.logout,
          ),
        ),
        const SizedBox(height: 24),
      ]),
    );
  }

  Widget _section(String title, List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 16),
        child: Text(title.toUpperCase(),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
            color: T.muted, letterSpacing: 1.1)),
      ),
      ...children,
    ],
  );

  Widget _tile(BuildContext context, IconData icon, String label, String sub, Color color, VoidCallback onTap) =>
    Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(width: 40, height: 40, alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: color, size: 20)),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: T.text, fontSize: 14)),
        subtitle: Text(sub, style: const TextStyle(color: T.muted, fontSize: 12)),
        trailing: const Icon(Icons.chevron_right, color: T.muted, size: 20),
        onTap: onTap,
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
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: T.surface, borderRadius: BorderRadius.circular(10),
            border: Border.all(color: isToday ? T.accent : T.border, width: 0.8)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.calendar_today_outlined, size: 14, color: isToday ? T.accent : T.muted),
            const SizedBox(width: 6),
            Text(
              '${date.day.toString().padLeft(2,'0')}.${date.month.toString().padLeft(2,'0')}.${date.year}',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                color: isToday ? T.accent : T.text)),
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
      width: 32, height: 32, alignment: Alignment.center,
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(8),
        border: Border.all(color: T.border, width: 0.5)),
      child: Icon(icon, size: 18, color: T.muted),
    ),
  );
}

// ── KPI Grid Layout ───────────────────────────────────────────────────────────

class _KpiGridLayout extends StatelessWidget {
  final List<_KpiCard> cards;
  final int cols;
  const _KpiGridLayout({required this.cards, required this.cols});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (int i = 0; i < cards.length; i += cols) {
      final rowCards = cards.sublist(i, (i + cols).clamp(0, cards.length));
      final isLastOdd = rowCards.length < cols;
      rows.add(Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (int j = 0; j < rowCards.length; j++) ...[
            if (j > 0) const SizedBox(width: 10),
            Expanded(child: rowCards[j]),
          ],
          if (isLastOdd)
            for (int k = rowCards.length; k < cols; k++) ...[
              const SizedBox(width: 10),
              const Expanded(child: SizedBox.shrink()),
            ],
        ],
      ));
      if (i + cols < cards.length) rows.add(const SizedBox(height: 10));
    }
    return Column(children: rows);
  }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label, value;
  final String? unit, delta;
  final String tag;
  final Color tagColor;
  final IconData icon;
  final bool? positive;

  const _KpiCard({
    required this.label, required this.value, this.unit,
    required this.tag, required this.tagColor, required this.icon,
    this.delta, this.positive,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: T.surface, borderRadius: BorderRadius.circular(16),
      border: Border.all(color: T.border, width: 0.5),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 32, height: 32, alignment: Alignment.center,
          decoration: BoxDecoration(color: tagColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 17, color: tagColor)),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(color: tagColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(tag, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: tagColor),
            maxLines: 1, overflow: TextOverflow.ellipsis)),
      ]),
      const SizedBox(height: 10),
      Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 10, color: T.muted, fontWeight: FontWeight.w500, letterSpacing: 0.5)),
      const SizedBox(height: 4),
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: T.text))),
        if (unit != null) Padding(
          padding: const EdgeInsets.only(bottom: 2, left: 3),
          child: Text(unit!, style: const TextStyle(fontSize: 10, color: T.muted))),
      ]),
      if (delta != null && delta!.isNotEmpty) ...[
        const SizedBox(height: 5),
        Row(children: [
          Icon(
            (positive ?? true) ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
            size: 11, color: (positive ?? true) ? T.success : T.danger),
          const SizedBox(width: 2),
          Text(delta!, style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w600,
            color: (positive ?? true) ? T.success : T.danger)),
          const SizedBox(width: 4),
          const Flexible(child: Text('vs вчера', maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10, color: T.muted))),
        ]),
      ],
    ]),
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
        horizontalInterval: (maxY <= 0 ? 1.0 : maxY) / 3,
        getDrawingHorizontalLine: (_) => const FlLine(color: T.border, strokeWidth: 0.5),
      ),
      borderData: FlBorderData(show: false),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => T.surfaceLight,
          tooltipBorder: const BorderSide(color: T.border),
          getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
            '${fmtNum(s.y, compact: true)} UZS',
            const TextStyle(color: T.accent, fontWeight: FontWeight.w600, fontSize: 12),
          )).toList(),
        ),
      ),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true, reservedSize: 40,
          getTitlesWidget: (v, _) => v == 0 ? const SizedBox.shrink()
              : Text(fmtNum(v, compact: true), style: const TextStyle(color: T.muted, fontSize: 9)),
        )),
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true, reservedSize: 24,
          interval: days > 14 ? 5 : 1,
          getTitlesWidget: (v, _) {
            final d = baseDate.subtract(Duration(days: (data.length - 1) - v.toInt()));
            return Padding(padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${d.day.toString().padLeft(2,'0')}.${d.month.toString().padLeft(2,'0')}',
                style: const TextStyle(color: T.muted, fontSize: 9)));
          },
        )),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots, isCurved: true, curveSmoothness: 0.3,
          color: T.accent, barWidth: 2.5, isStrokeCapRound: true,
          dotData: FlDotData(show: true,
            getDotPainter: (s, _, __, ___) => FlDotCirclePainter(
              radius: 3.5, color: T.accent, strokeWidth: 2, strokeColor: T.bg)),
          belowBarData: BarAreaData(show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter, end: Alignment.bottomCenter,
              colors: [T.accent.withValues(alpha: 0.18), T.accent.withValues(alpha: 0)])),
        ),
      ],
    ));
  }
}
