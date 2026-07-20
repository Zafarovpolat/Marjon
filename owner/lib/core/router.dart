import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'app_state.dart';
import '../pages/login_page.dart';
import '../pages/dashboard_page.dart';
import '../pages/orders/orders_page.dart';
import '../pages/staff/staff_page.dart';
import '../pages/menu/menu_page.dart';
import '../pages/analytics/analytics_page.dart';
import '../pages/finance/finance_page.dart';
import '../pages/reports/reports_page.dart';
import '../pages/settings/settings_page.dart';
import '../pages/branches/branches_page.dart';
import '../pages/printers/printers_page.dart';
import '../pages/profile_page.dart';

/// Route name constants — use these instead of raw strings.
class Routes {
  static const login     = '/login';
  static const dashboard = '/';
  static const orders    = '/orders';
  static const staff     = '/staff';
  static const menu      = '/menu';
  static const analytics = '/analytics';
  static const finance   = '/finance';
  static const reports   = '/reports';
  static const settings  = '/settings';
  static const branches  = '/branches';
  static const printers  = '/printers';
  static const profile   = '/profile';
}

GoRouter buildRouter(AppState appState) => GoRouter(
  initialLocation: Routes.dashboard,
  redirect: (context, state) {
    final loggedIn = appState.isLoggedIn;
    final onLogin  = state.matchedLocation == Routes.login;
    if (!loggedIn && !onLogin) return Routes.login;
    if (loggedIn  &&  onLogin) return Routes.dashboard;
    return null;
  },
  refreshListenable: appState,
  routes: [
    GoRoute(
      path: Routes.login,
      builder: (_, __) => const LoginPage(),
    ),
    GoRoute(
      path: Routes.dashboard,
      builder: (_, __) => const DashboardPage(),
      routes: [
        GoRoute(path: 'orders',    builder: (_, __) => const OrdersPage()),
        GoRoute(path: 'staff',     builder: (_, __) => const StaffPage()),
        GoRoute(path: 'menu',      builder: (_, __) => const MenuPage()),
        GoRoute(path: 'analytics', builder: (_, __) => const AnalyticsPage()),
        GoRoute(path: 'finance',   builder: (_, __) => const FinancePage()),
        GoRoute(path: 'reports',   builder: (_, __) => const ReportsPage()),
        GoRoute(path: 'settings',  builder: (_, __) => const SettingsPage()),
        GoRoute(path: 'branches',  builder: (_, __) => const BranchesPage()),
        GoRoute(path: 'printers',  builder: (_, __) => const PrintersPage()),
        GoRoute(path: 'profile',   builder: (_, __) => const ProfilePage()),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: Center(child: Text('Страница не найдена: ${state.error}')),
  ),
);
