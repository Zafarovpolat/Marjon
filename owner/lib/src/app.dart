import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'features/auth/login_page.dart';
import 'features/dashboard/dashboard_page.dart';
import 'features/onboarding/onboarding_page.dart';
import 'features/finance/finance_pages.dart';
import 'features/menu/menu_pages.dart';
import 'features/orders/orders_page.dart';
import 'features/reports/reports_pages.dart';
import 'features/settings/settings_pages.dart';
import 'features/staff/staff_pages.dart';
import 'features/warehouse/warehouse_pages.dart';
import 'session.dart';
import 'theme/app_theme.dart';
import 'theme/tokens.dart';
import 'ui/common.dart';
import 'ui/kit.dart';

class OwnerApp extends StatelessWidget {
  const OwnerApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Marjon Owner',
        debugShowCheckedModeBanner: false,
        theme: buildMarjonTheme(),
        locale: const Locale('ru'),
        supportedLocales: const [Locale('ru'), Locale('en')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        home: const _Gate(),
      );
}

class _Gate extends StatelessWidget {
  const _Gate();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (!s.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (!s.onboardingSeen) return OnboardingPage(onDone: s.completeOnboarding);
    return s.signedIn ? const Shell() : const LoginPage();
  }
}

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const DashboardPage(),
      const OrdersPage(),
      const ReportsHubPage(),
      const MenuHubPage(),
      const MorePage(),
    ];
    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        backgroundColor: MC.card,
        indicatorColor: MC.brandBg,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard, color: MC.teal600), label: 'Дашборд'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: MC.teal600), label: 'Заказы'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.bar_chart, color: MC.teal600), label: 'Отчёты'),
          NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu, color: MC.teal600), label: 'Меню'),
          NavigationDestination(icon: Icon(Icons.menu), selectedIcon: Icon(Icons.menu, color: MC.teal600), label: 'Ещё'),
        ],
      ),
    );
  }
}

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    Widget row(IconData i, String l, Widget page) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Card2(onTap: () => push(context, page), child: Row(children: [Icon(i, color: MC.teal600), const SizedBox(width: 14), Expanded(child: Text(l, style: MT.body.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right, color: MC.n300)])),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Ещё')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card2(child: Row(children: [
          Avatar(s.displayName, size: 46),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s.displayName, style: MT.body.copyWith(fontWeight: FontWeight.w700)), Text('Владелец', style: MT.small)])),
        ])),
        const SizedBox(height: 16),
        row(Icons.groups_outlined, 'Сотрудники', const StaffPage()),
        row(Icons.inventory_2_outlined, 'Склад', const WarehouseHubPage()),
        row(Icons.account_balance_wallet_outlined, 'Финансы', const FinanceHubPage()),
        row(Icons.settings_outlined, 'Настройки', const SettingsHubPage()),
        const SizedBox(height: 12),
        GhostButton(
          label: 'Выйти',
          icon: Icons.logout,
          onPressed: () async {
            if (await confirm(context, 'Выйти из аккаунта?', action: 'Выйти', danger: false)) {
              await s.logout();
            }
          },
        ),
        const SizedBox(height: 16),
        Center(child: Text('Marjon Owner 1.1.0', style: MT.small)),
      ]),
    );
  }
}
