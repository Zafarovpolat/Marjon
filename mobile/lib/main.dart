import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/app_state.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'l10n/app_localizations.dart';
import 'view_models/cashier_view_model.dart';
import 'view_models/kitchen_view_model.dart';
import 'view_models/waiter_view_model.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final appState = AppState()..init();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: appState),
        ChangeNotifierProvider(create: (_) => CashierViewModel()),
        ChangeNotifierProvider(create: (_) => WaiterViewModel()),
        ChangeNotifierProvider(create: (_) => KitchenViewModel()),
      ],
      child: MarjonApp(appState: appState),
    ),
  );
}

class MarjonApp extends StatefulWidget {
  final AppState appState;
  const MarjonApp({super.key, required this.appState});
  @override
  State<MarjonApp> createState() => _MarjonAppState();
}

class _MarjonAppState extends State<MarjonApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = buildRouter(widget.appState);
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'Marjon',
    debugShowCheckedModeBanner: false,
    theme: AppTheme.darkTheme,
    routerConfig: _router,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
  );
}
