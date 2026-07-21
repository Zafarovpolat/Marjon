import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:marjon_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login screen renders all required fields', (tester) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // Login screen must be shown when no token is stored
    expect(find.byKey(const ValueKey('login_server_field')), findsOneWidget);
    expect(find.byKey(const ValueKey('login_email_field')), findsOneWidget);
    expect(find.byKey(const ValueKey('login_pass_field')), findsOneWidget);
  });

  testWidgets('login screen has submit button', (tester) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 3));

    expect(find.widgetWithText(ElevatedButton, 'Войти'), findsOneWidget);
  });
}
