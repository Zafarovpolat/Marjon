import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/app_state.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'l10n/app_localizations.dart';
import 'view_models/dashboard_view_model.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final appState = AppState()..init();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: appState),
        ChangeNotifierProvider(create: (_) => DashboardViewModel()),
      ],
      child: MarjonOwnerApp(appState: appState),
    ),
  );
}

class MarjonOwnerApp extends StatefulWidget {
  final AppState appState;
  const MarjonOwnerApp({super.key, required this.appState});
  @override
  State<MarjonOwnerApp> createState() => _MarjonOwnerAppState();
}

class _MarjonOwnerAppState extends State<MarjonOwnerApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = buildRouter(widget.appState);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Marjon Owner',
      debugShowCheckedModeBanner: false,
      theme: T.theme,
      routerConfig: _router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
