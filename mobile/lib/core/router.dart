import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'app_state.dart';
import '../pages/login_page.dart';
import '../pages/branch_page.dart';
import '../pages/mode_page.dart';
import '../pages/cashier_page.dart';
import '../pages/waiter_page.dart';
import '../pages/kitchen_page.dart';
import '../pages/settings_page.dart';
import '../pages/privacy_policy_page.dart';
import '../core/theme.dart';

class Routes {
  static const login    = '/login';
  static const branch   = '/branch';
  static const mode     = '/mode';
  static const cashier  = '/cashier';
  static const waiter   = '/waiter';
  static const kitchen  = '/kitchen';
  static const bar      = '/bar';
  static const settings = '/settings';
  static const privacy  = '/privacy';
}

CustomTransitionPage<void> _fadePage(GoRouterState state, Widget child) =>
  CustomTransitionPage(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 220),
    transitionsBuilder: (ctx, animation, secondary, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
      child: child,
    ),
  );

CustomTransitionPage<void> _slidePage(GoRouterState state, Widget child) =>
  CustomTransitionPage(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 280),
    transitionsBuilder: (ctx, animation, secondary, child) {
      final tween = Tween<Offset>(begin: const Offset(1, 0), end: Offset.zero)
          .animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic));
      return SlideTransition(position: tween, child: child);
    },
  );

GoRouter buildRouter(AppState appState) => GoRouter(
  initialLocation: Routes.cashier,
  refreshListenable: appState,
  redirect: (context, state) {
    final loc = state.matchedLocation;

    if (!appState.isLoggedIn) {
      return loc == Routes.login ? null : Routes.login;
    }
    if (!appState.hasBranch) {
      return loc == Routes.branch ? null : Routes.branch;
    }

    final mode = appState.mode ?? appState.autoMode;
    if (mode == null) {
      return loc == Routes.mode ? null : Routes.mode;
    }

    // Settings and privacy are always accessible
    if (loc == Routes.settings || loc == Routes.privacy) return null;

    final target = '/$mode';
    return loc == target ? null : target;
  },
  routes: [
    GoRoute(path: Routes.login,    pageBuilder: (c, s) => _fadePage(s, const LoginPage())),
    GoRoute(path: Routes.branch,   pageBuilder: (c, s) => _fadePage(s, const BranchPage())),
    GoRoute(path: Routes.mode,     pageBuilder: (c, s) => _fadePage(s, const ModePage())),
    GoRoute(path: Routes.cashier,  pageBuilder: (c, s) => _fadePage(s, const CashierPage())),
    GoRoute(path: Routes.waiter,   pageBuilder: (c, s) => _fadePage(s, const WaiterPage())),
    GoRoute(path: Routes.kitchen,  pageBuilder: (c, s) => _fadePage(s, const KitchenPage())),
    GoRoute(path: Routes.bar,      pageBuilder: (c, s) => _fadePage(s, const KitchenPage(
      title: 'Бар', accentColor: AppTheme.purple))),
    GoRoute(path: Routes.settings, pageBuilder: (c, s) => _slidePage(s, const SettingsPage())),
    GoRoute(path: Routes.privacy,  pageBuilder: (c, s) => _slidePage(s, const PrivacyPolicyPage())),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: Center(child: Text('Страница не найдена: ${state.error}')),
  ),
);
