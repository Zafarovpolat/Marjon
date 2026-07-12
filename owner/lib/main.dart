import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/app_state.dart';
import 'core/theme.dart';
import 'pages/login_page.dart';
import 'pages/dashboard_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ChangeNotifierProvider(
    create: (_) => AppState()..init(),
    child: const MarjonOwnerApp(),
  ));
}

class MarjonOwnerApp extends StatelessWidget {
  const MarjonOwnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Marjon Owner',
      debugShowCheckedModeBanner: false,
      theme: T.theme,
      home: Consumer<AppState>(
        builder: (_, state, __) => state.isLoggedIn ? const DashboardPage() : const LoginPage(),
      ),
    );
  }
}
