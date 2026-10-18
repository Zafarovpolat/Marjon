import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/app.dart';
import 'package:marjon_mobile/src/i18n/strings.dart';
import 'package:marjon_mobile/src/session/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

Map<String, Object> _prefs(String role) => {
      'marjon_org_token': 'org-1',
      'marjon_org_user': '{"name":"Marjon Cafe","company_name":"Marjon Cafe"}',
      'marjon_branch': '{"id":"b1","name":"Central"}',
      'marjon_token': 'staff-1',
      'marjon_user': '{"id":"u1","name":"Dilnoza","role_slugs":["$role"],"branch_id":"b1"}',
      'marjon_mode': role,
      'marjon_server_url': 'http://127.0.0.1:1/api/v1',
    };

final _halls = [
  {
    'id': 'h1',
    'name': 'Зал',
    'tables': [
      {'id': 't1', 'number': 1, 'capacity': 4},
      {'id': 't2', 'number': 2, 'capacity': 4},
    ],
  },
];

final _products = [
  {'id': 'p1', 'name': 'Плов', 'price': 35000, 'is_available': true, 'category_id': 'c1'},
  {'id': 'p2', 'name': 'Лагман', 'price': 32000, 'is_available': false, 'category_id': 'c1'},
];

Future<void> _pump(WidgetTester tester, Map<String, Handler> routes, String role) async {
  final a = await setUpApi({
    'GET /halls': (o) => _halls,
    'GET /pos/orders': (o) => [],
    'GET /inventory/products': (o) => _products,
    'GET /inventory/categories': (o) => [{'id': 'c1', 'name': 'Горячее'}],
    'GET /image-backgrounds/active': (o) => <String, Object?>{},
    'GET /printers': (o) => [],
    'GET /auth/branch-colleagues': (o) => [],
    ...routes,
  }, prefs: _prefs(role));
  addTearDown(() => a.log.clear());
  usePhone(tester);
  final s = Session();
  await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const MarjonApp()));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
}

Future<void> _dispose(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  testWidgets('cashier sees the tables of the hall and their state', (tester) async {
    await _pump(tester, {
      'GET /pos/orders': (o) => [
            {'id': 'o1', 'order_number': '7', 'table_number': '2', 'status': 'new', 'order_type': 'dine_in', 'total_amount': 78400, 'items': []},
          ],
    }, 'cashier');
    expect(find.textContaining('1'), findsWidgets);
    expect(find.text(t('busy')), findsWidgets);
    expect(find.text(t('free')), findsWidgets);
    await _dispose(tester);
  });

  testWidgets('cashier builds and creates an order for a free table', (tester) async {
    final a = await setUpApiWith(tester);
    await tester.tap(find.text(t('free')).first);
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(find.text('Плов'), findsWidgets);
    await tester.tap(find.text('Плов').first);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.textContaining('${t('order')} · 1'));
    await tester.pump(const Duration(seconds: 1));
    tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, t('create_order'))).onPressed!();
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    final body = a.calls('POST /pos/orders').single.data as Map;
    expect('${body['table_number']}', '1');
    expect((body['items'] as List).single['product_id'], 'p1');
    await _dispose(tester);
  });

  testWidgets('a waiter lands on the waiter screen, not the cashier one', (tester) async {
    await _pump(tester, {}, 'waiter');
    expect(find.text(modeLabels['cashier']!), findsNothing);
    await _dispose(tester);
  });

  testWidgets('kitchen sees incoming orders and can mark one ready', (tester) async {
    var ready = false;
    await _pump(tester, {
      'GET /kitchen/orders': (o) => [
            {
              'id': 'k1',
              'order_number': '5',
              'table_number': '3',
              'status': 'new',
              'created_at': DateTime.now().toIso8601String(),
              'items': [
                {'id': 'i1', 'name': 'Плов', 'quantity': 2, 'status': 'new'},
              ],
            },
          ],
      'PATCH /kitchen/orders/k1/ready': (o) {
        ready = true;
        return {'ok': true};
      },
    }, 'kitchen');
    expect(find.textContaining('Плов'), findsWidgets);
    expect(ready, false);
    await _dispose(tester);
  });
}

Future<FakeAdapter> setUpApiWith(WidgetTester tester) async {
  final a = await setUpApi({
    'GET /halls': (o) => _halls,
    'GET /pos/orders': (o) => [],
    'GET /inventory/products': (o) => _products,
    'GET /inventory/categories': (o) => [{'id': 'c1', 'name': 'Горячее'}],
    'GET /image-backgrounds/active': (o) => <String, Object?>{},
    'GET /printers': (o) => [],
    'GET /auth/branch-colleagues': (o) => [],
    'POST /pos/orders': (o) => {'id': 'new', 'order_number': '1', 'table_number': '1', 'status': 'new', 'items': []},
  }, prefs: _prefs('cashier'));
  usePhone(tester);
  final s = Session();
  await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const MarjonApp()));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
  return a;
}
