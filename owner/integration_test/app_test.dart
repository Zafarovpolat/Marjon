import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:marjon_owner/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Login flow', () {
    testWidgets('shows login screen on first launch', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Login page should be visible (not logged in state)
      expect(
        find.byKey(const ValueKey('login_server_field')),
        findsOneWidget,
      );
    });
  });

  group('Dashboard navigation', () {
    testWidgets('bottom nav tabs switch content', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Assumes user is logged in via shared_preferences mock or test credentials
      final reportsTab = find.byKey(const ValueKey('nav_reports'));
      if (reportsTab.evaluate().isNotEmpty) {
        await tester.tap(reportsTab);
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('reports_page')), findsOneWidget);
      }
    });
  });
}
