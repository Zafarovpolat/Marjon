import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/app_state.dart';
import 'core/theme.dart';
import 'pages/login_page.dart';
import 'pages/branch_page.dart';
import 'pages/mode_page.dart';
import 'pages/cashier_page.dart';
import 'pages/waiter_page.dart';
import 'pages/kitchen_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState()..init(),
      child: const MarjonApp(),
    ),
  );
}

class MarjonApp extends StatelessWidget {
  const MarjonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Marjon',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: Consumer<AppState>(
        builder: (ctx, state, _) {
          // 1. Not logged in
          if (!state.isLoggedIn) return const LoginPage();

          // 2. No branch selected
          if (!state.hasBranch) return const BranchPage();

          // 3. Admin → mode selector (or mode already chosen)
          //    Staff → auto-navigate to their role's screen
          final mode = state.mode ?? state.autoMode;
          if (mode == null) return const ModePage();

          switch (mode) {
            case 'cashier':
              return const CashierPage();
            case 'waiter':
              return const WaiterPage();
            case 'kitchen':
              return const KitchenPage();
            case 'bar':
              return const KitchenPage(title: 'Бар', accentColor: AppTheme.purple);
            default:
              return const ModePage();
          }
        },
      ),
    );
  }
}
