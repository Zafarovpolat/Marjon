import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/app.dart';
import 'package:marjon_mobile/src/features/auth/staff_login_screen.dart';
import 'package:marjon_mobile/src/i18n/strings.dart';
import 'package:marjon_mobile/src/net/store.dart';
import 'package:marjon_mobile/src/session/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

Future<Session> _pumpApp(WidgetTester tester) async {
  usePhone(tester);
  final s = Session();
  await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const MarjonApp()));
  await tester.pump(const Duration(milliseconds: 300));
  return s;
}

/// Pumps only the login screen (not the full Gate), so a successful sign-in
/// never has to stand up the Workspace (kitchen socket, floor data, ...).
Future<Session> _pumpLoginScreen(WidgetTester tester) async {
  usePhone(tester);
  final s = Session();
  await tester.pumpWidget(ChangeNotifierProvider<Session>.value(
    value: s,
    child: MaterialApp(home: Builder(builder: (_) => const StaffLoginScreen())),
  ));
  await tester.pump(const Duration(milliseconds: 300));
  return s;
}

Future<void> _settle(WidgetTester tester, {int ms = 600}) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(Duration(milliseconds: ms ~/ 4));
  }
}

/// Removes the tree so periodic timers (clock, floor refresh) do not outlive the test.
Future<void> _dispose(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  group('staff login', () {
    testWidgets('a signed-out app starts on the phone + password screen', (tester) async {
      await setUpApi({});
      await _pumpApp(tester);
      expect(find.byType(StaffLoginScreen), findsOneWidget);
      expect(find.text(t('enter')), findsOneWidget);
      await _dispose(tester);
    });

    testWidgets('rejects an incomplete phone without calling the server', (tester) async {
      final a = await setUpApi({});
      await _pumpLoginScreen(tester);
      await tester.enterText(find.byType(TextField).at(0), '90111');
      await tester.enterText(find.byType(TextField).at(1), 'pw');
      await tester.tap(find.text(t('enter')));
      await _settle(tester);
      expect(find.text(t('lp_phone_incomplete')), findsOneWidget);
      expect(a.calls('POST /auth/login'), isEmpty);
      await _dispose(tester);
    });

    testWidgets('wrong credentials show the localized error', (tester) async {
      await setUpApi({'POST /auth/login': (o) => Reply({'detail': 'bad'}, status: 401)});
      await _pumpLoginScreen(tester);
      await tester.enterText(find.byType(TextField).at(0), '901112233');
      await tester.enterText(find.byType(TextField).at(1), 'nope');
      await tester.tap(find.text(t('enter')));
      await _settle(tester);
      expect(find.text(t('lp_bad_creds')), findsOneWidget);
      await _dispose(tester);
    });

    testWidgets('network failure is shown as such', (tester) async {
      await setUpApi({'POST /auth/login': (o) => throw NetDown()});
      await _pumpLoginScreen(tester);
      await tester.enterText(find.byType(TextField).at(0), '901112233');
      await tester.enterText(find.byType(TextField).at(1), 'pw');
      await tester.tap(find.text(t('enter')));
      await _settle(tester);
      expect(find.text('Нет связи с сервером'), findsOneWidget);
      await _dispose(tester);
    });

    testWidgets('an account with no branch shows a clear error and stays out', (tester) async {
      await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'T'},
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Waiter', 'role_slugs': ['waiter'], 'branch_id': null},
      });
      final s = await _pumpLoginScreen(tester);
      await tester.enterText(find.byType(TextField).at(0), '901112233');
      await tester.enterText(find.byType(TextField).at(1), 'pw');
      await tester.tap(find.text(t('enter')));
      await _settle(tester);
      expect(s.staffIn, false);
      expect(find.textContaining('филиалу'), findsOneWidget);
      await _dispose(tester);
    });

    testWidgets('valid credentials sign the employee straight into their workplace — no picker, no PIN', (tester) async {
      final a = await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'T-1', 'refresh_token': 'R-1'},
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Alisher', 'role_slugs': ['waiter'], 'branch_id': 'b1'},
        'GET /companies/me/branches': (o) => [
              {'id': 'b1', 'name': 'Central'},
            ],
      });
      final s = await _pumpLoginScreen(tester);
      await tester.enterText(find.byType(TextField).at(0), '901112233');
      await tester.enterText(find.byType(TextField).at(1), 'Marjon2026!');
      await tester.tap(find.text(t('enter')));
      await _settle(tester);
      final body = a.calls('POST /auth/login').single.data as Map;
      expect(body['phone'], '+998901112233');
      expect(s.staffIn, true);
      expect(s.branchId, 'b1');
      expect(s.branch?['name'], 'Central');
      expect(s.mode, 'waiter');
      expect(s.userName, 'Alisher');
      expect(Store.staffToken, 'T-1');
      await _dispose(tester);
    });

    testWidgets('a signed-in session goes straight to the workspace, skipping the login screen', (tester) async {
      await setUpApi({
        'GET /halls': (o) => [],
        'GET /inventory/categories': (o) => [],
        'GET /kitchen/orders': (o) => [],
      }, prefs: {
        'marjon_token': 'staff-1',
        'marjon_user': '{"id":"u1","name":"Dilnoza","role_slugs":["cashier"],"branch_id":"b1"}',
        'marjon_branch': '{"id":"b1","name":"Central"}',
        'marjon_mode': 'cashier',
        'marjon_server_url': 'http://127.0.0.1:1/api/v1',
      });
      await _pumpApp(tester);
      expect(find.byType(StaffLoginScreen), findsNothing);
      expect(find.textContaining('Dilnoza'), findsOneWidget);
      await _dispose(tester);
    });
  });
}
