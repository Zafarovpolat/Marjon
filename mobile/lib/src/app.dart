import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'features/auth/staff_login_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/workspace/workspace.dart';
import 'i18n/strings.dart';
import 'session/session.dart';
import 'theme/app_theme.dart';

class MarjonApp extends StatelessWidget {
  const MarjonApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return MaterialApp(
      // language change rebuilds the whole tree so every t() call re-reads
      key: ValueKey(currentLang()),
      title: 'Marjon Staff',
      debugShowCheckedModeBanner: false,
      theme: buildMarjonTheme(),
      locale: Locale(currentLang()),
      supportedLocales: const [Locale('ru'), Locale('uz')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: _Gate(session: session),
    );
  }
}

class _Gate extends StatelessWidget {
  const _Gate({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    if (!session.onboardingSeen) return OnboardingScreen(onDone: session.completeOnboarding);
    if (session.staffIn) return const Workspace();
    return const StaffLoginScreen();
  }
}
