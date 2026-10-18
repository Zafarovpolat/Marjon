import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/app.dart';
import 'package:marjon_owner/src/features/common/resource_page.dart';
import 'package:marjon_owner/src/features/common/resources.dart';
import 'package:marjon_owner/src/features/orders/orders_page.dart';
import 'package:marjon_owner/src/features/reports/reports_pages.dart';
import 'package:marjon_owner/src/features/staff/staff_pages.dart';
import 'package:marjon_owner/src/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

Map<String, Handler> _dashboardRoutes() => {
      'GET /auth/me': (o) => {'id': 'u1', 'name': 'Owner'},
      'GET /analytics/dashboard': (o) => {'today_revenue': 78400, 'today_orders': 3, 'avg_check': 26133, 'active_orders': 2},
      'GET /analytics/sales': (o) => [
            {'date': _today(), 'orders_count': 3, 'revenue': 78400, 'avg_check': 26133},
          ],
      'GET /analytics/products/top': (o) => [
            {'product_id': 'p1', 'name': 'Плов Ташкентский', 'quantity_sold': 2, 'revenue': 70000},
          ],
      'GET /finance/transactions': (o) => [
            {'id': 't1', 'direction': 'income', 'amount': 100000},
            {'id': 't2', 'direction': 'expense', 'amount': 30000},
          ],
      'GET /billing/balance': (o) => {'balance': 500000, 'days_left': 12},
    };

Finder _nav(String label) => find.descendant(of: find.byType(NavigationBar), matching: find.text(label));

Future<Session> _pumpApp(WidgetTester tester) async {
  usePhone(tester);
  final s = Session();
  await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const OwnerApp()));
  s.init();
  await tester.pumpAndSettle();
  return s;
}

// Same shape as the real units config, but writable — the generic list/form logic is what is under test.
final _editableUnits = ResourceConfig(
  title: 'Единицы измерения',
  path: '/units',
  createLabel: 'Новая единица',
  emptyText: 'Единиц пока нет',
  itemTitle: (r) => '${r['name']}${r['short_name'] != null ? ' (${r['short_name']})' : ''}',
  fields: const [
    Field('name', 'Название', required: true),
    Field('short_name', 'Сокращение'),
    Field('sort', 'Порядок', type: FieldType.number, defaultValue: 0),
    Field('status', 'Активна', type: FieldType.toggle, defaultValue: true),
  ],
);

void main() {
  group('login', () {
    testWidgets('a signed-out user sees the login page', (tester) async {
      await setUpApi({});
      await _pumpApp(tester);
      expect(find.text('Marjon Owner'), findsOneWidget);
      expect(find.text('Войти'), findsOneWidget);
    });

    testWidgets('empty fields do not call the server', (tester) async {
      final a = await setUpApi({});
      await _pumpApp(tester);
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();
      expect(a.log, isEmpty);
    });

    testWidgets('wrong credentials show a clear message', (tester) async {
      await setUpApi({'POST /auth/login': (o) => Reply({'detail': 'bad'}, status: 401)});
      await _pumpApp(tester);
      await tester.enterText(find.byType(TextField).at(0), '+998901112233');
      await tester.enterText(find.byType(TextField).at(1), 'wrong');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();
      expect(find.text('Неверный логин или пароль'), findsOneWidget);
    });

    testWidgets('an unreachable server is reported as such', (tester) async {
      await setUpApi({'POST /auth/login': (o) => throw NetDown()});
      await _pumpApp(tester);
      await tester.enterText(find.byType(TextField).at(0), '+998901112233');
      await tester.enterText(find.byType(TextField).at(1), 'pw');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();
      expect(find.text('Нет связи с сервером'), findsOneWidget);
    });

    testWidgets('a successful login opens the dashboard', (tester) async {
      await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'A', 'refresh_token': 'R'},
        ..._dashboardRoutes(),
      });
      final s = await _pumpApp(tester);
      await tester.enterText(find.byType(TextField).at(0), '+998901112233');
      await tester.enterText(find.byType(TextField).at(1), 'Marjon2026!');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();
      expect(s.signedIn, true);
      expect(find.text('Здравствуйте, Owner'), findsOneWidget);
    });

    testWidgets('the password can be revealed', (tester) async {
      await setUpApi({});
      await _pumpApp(tester);
      expect(tester.widget<TextField>(find.byType(TextField).at(1)).obscureText, true);
      await tester.tap(find.byIcon(Icons.visibility_outlined));
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField).at(1)).obscureText, false);
    });

    testWidgets('a stored session skips the login', (tester) async {
      await setUpApi(_dashboardRoutes(), prefs: signedIn);
      await _pumpApp(tester);
      expect(find.text('Marjon Owner'), findsNothing);
      expect(find.text('Здравствуйте, Owner'), findsOneWidget);
    });
  });

  group('dashboard', () {
    testWidgets('shows the KPIs, top dishes, cash flow and balance', (tester) async {
      await setUpApi(_dashboardRoutes(), prefs: signedIn);
      await _pumpApp(tester);
      expect(find.text('78 400 сум'), findsOneWidget);
      expect(find.text('500 000 сум'), findsOneWidget, reason: 'balance tile');
      await tester.dragUntilVisible(find.text('Плов Ташкентский'), find.byType(ListView).first, const Offset(0, -300));
      expect(find.text('Плов Ташкентский'), findsOneWidget);
      await tester.dragUntilVisible(find.text('Итого'), find.byType(ListView).first, const Offset(0, -300));
      expect(find.text('+100 000 сум'), findsOneWidget);
      expect(find.text('−30 000 сум'), findsOneWidget);
      expect(find.text('70 000 сум'), findsWidgets);
    });

    testWidgets('a failing endpoint shows an error with retry', (tester) async {
      var ok = false;
      await setUpApi({
        ..._dashboardRoutes(),
        'GET /analytics/dashboard': (o) => ok ? {'today_revenue': 1, 'today_orders': 1, 'avg_check': 1, 'active_orders': 0} : Reply({'detail': 'boom'}, status: 500),
      }, prefs: signedIn);
      await _pumpApp(tester);
      expect(find.textContaining('Не удалось загрузить'), findsOneWidget);
      ok = true;
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(find.text('Здравствуйте, Owner'), findsOneWidget);
    });

    testWidgets('bottom navigation switches sections', (tester) async {
      await setUpApi({
        ..._dashboardRoutes(),
        'GET /pos/orders': (o) => [],
      }, prefs: signedIn);
      await _pumpApp(tester);
      await tester.tap(_nav('Заказы'));
      await tester.pumpAndSettle();
      expect(find.text('Заказов за этот день нет'), findsOneWidget);
      await tester.tap(_nav('Ещё'));
      await tester.pumpAndSettle();
      expect(find.text('Сотрудники'), findsOneWidget);
      expect(find.text('Склад'), findsOneWidget);
      expect(find.text('Финансы'), findsOneWidget);
      expect(find.text('Настройки'), findsOneWidget);
    });

    testWidgets('logout asks for confirmation and clears the session', (tester) async {
      await setUpApi({..._dashboardRoutes(), 'POST /auth/logout': (o) => {}}, prefs: signedIn);
      final s = await _pumpApp(tester);
      await tester.tap(_nav('Ещё'));
      await tester.pumpAndSettle();
      await tester.dragUntilVisible(find.text('Выйти'), find.byType(ListView).last, const Offset(0, -200));
      await tester.tap(find.text('Выйти'));
      await tester.pumpAndSettle();
      expect(find.text('Выйти из аккаунта?'), findsOneWidget);
      await tester.tap(find.text('Выйти').last);
      await tester.pumpAndSettle();
      expect(s.signedIn, false);
      expect(find.text('Marjon Owner'), findsOneWidget);
    });
  });

  group('orders', () {
    Map<String, Object?> order(String id, String status, {String? table, num total = 78400}) => {
          'id': id, 'order_number': id.toUpperCase(), 'status': status, 'order_type': 'dine_in', 'table_number': table,
          'total_amount': total, 'created_at': '2026-09-25T11:48:00', 'waiter_name': 'Waiter', 'items': [
            {'id': 'i1', 'name': 'Плов', 'quantity': 2, 'total': 70000},
          ], 'subtotal': total, 'discount_amount': 0, 'service_fee': 0, 'tax_amount': 0,
        };

    testWidgets('lists the day orders with a total that skips cancelled ones', (tester) async {
      await setUpApi({
        'GET /pos/orders': (o) => [order('a1', 'completed', table: '1', total: 50000), order('a2', 'cancelled', total: 999999), order('a3', 'new', table: '2', total: 10000)],
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const OrdersPage()));
      await tester.pumpAndSettle();
      expect(find.text('3 заказов · 60 000 сум'), findsOneWidget);
      expect(find.text('Закрыт'), findsOneWidget);
      expect(find.text('Отменён'), findsOneWidget);
    });

    testWidgets('the status chip filters on the server', (tester) async {
      final a = await setUpApi({'GET /pos/orders': (o) => []}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const OrdersPage()));
      await tester.pumpAndSettle();
      expect(a.calls('GET /pos/orders').last.queryParameters.containsKey('status'), false);
      await tester.tap(find.text('Новые'));
      await tester.pumpAndSettle();
      expect(a.calls('GET /pos/orders').last.queryParameters['status'], 'new');
      expect(a.calls('GET /pos/orders').last.queryParameters['date'], _today());
    });

    testWidgets('a new order offers only the steps the backend allows', (tester) async {
      var status = 'new';
      final a = await setUpApi({
        'GET /pos/orders/o1': (o) => order('o1', status, table: '4'),
        'PATCH /pos/orders/o1/status': (o) {
          status = (o.data as Map)['status'] as String;
          return {};
        },
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(OrderDetailPage(order: order('o1', 'new'))));
      await tester.pumpAndSettle();
      expect(find.text('Плов'), findsOneWidget);
      expect(find.text('Готов'), findsNothing, reason: 'new -> ready is not a legal transition');
      expect(find.text('Закрыть заказ'), findsNothing);
      await tester.tap(find.text('На кухню'));
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /pos/orders/o1/status').single.data as Map)['status'], 'cooking');
      expect(find.text('Готов'), findsWidgets, reason: 'the next step (ready) is now offered');
      expect(find.text('На кухню'), findsNothing);
    });

    testWidgets('a ready order can be closed', (tester) async {
      final a = await setUpApi({
        'GET /pos/orders/o1': (o) => order('o1', 'ready'),
        'PATCH /pos/orders/o1/status': (o) => {},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(OrderDetailPage(order: order('o1', 'ready'))));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Закрыть заказ'));
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /pos/orders/o1/status').single.data as Map)['status'], 'completed');
    });

    testWidgets('cancelling asks for confirmation first', (tester) async {
      final a = await setUpApi({
        'GET /pos/orders/o1': (o) => order('o1', 'new'),
        'PATCH /pos/orders/o1/status': (o) => {},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(OrderDetailPage(order: order('o1', 'new'))));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Отмена'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Отменить заказ'), findsOneWidget);
      expect(a.calls('PATCH /pos/orders/o1/status'), isEmpty);
      await tester.tap(find.text('Отменить').last);
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /pos/orders/o1/status').single.data as Map)['status'], 'cancelled');
    });

    testWidgets('finished orders have no status buttons', (tester) async {
      await setUpApi({'GET /pos/orders/o1': (o) => order('o1', 'completed')}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(OrderDetailPage(order: order('o1', 'completed'))));
      await tester.pumpAndSettle();
      expect(find.text('Принять'), findsNothing);
      expect(find.text('Закрыть заказ'), findsNothing);
      expect(find.text('Отмена'), findsNothing);
    });

    testWidgets('a server error on status change is shown, not swallowed', (tester) async {
      await setUpApi({
        'GET /pos/orders/o1': (o) => order('o1', 'new'),
        'PATCH /pos/orders/o1/status': (o) => Reply({'detail': 'Недопустимый переход'}, status: 409),
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(OrderDetailPage(order: order('o1', 'new'))));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Принять'));
      await tester.pumpAndSettle();
      expect(find.text('Недопустимый переход'), findsOneWidget);
    });
  });

  group('reports', () {
    testWidgets('the hub lists every report', (tester) async {
      usePhone(tester);
      await tester.pumpWidget(host(const ReportsHubPage()));
      for (final t in ['Z-отчёт', 'Отчёт по заказам', 'Отчёт по официантам', 'Отчёт по блюдам', 'Отчёт по столам', 'Отменённые блюда', 'Дебиторы и кредиторы']) {
        await tester.dragUntilVisible(find.text(t), find.byType(ListView), const Offset(0, -100));
        expect(find.text(t), findsOneWidget);
      }
    });

    testWidgets('a report requests the chosen period and shows a total', (tester) async {
      final a = await setUpApi({
        'GET /reports/dishes': (o) => [{'name': 'Плов', 'quantity': 3, 'total': 105000}, {'name': 'Чай', 'quantity': 1, 'total': 8000}],
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const ReportPage(kind: 'dishes')));
      await tester.pumpAndSettle();
      expect(a.calls('GET /reports/dishes').single.queryParameters['date_from'], _today());
      expect(find.text('113 000 сум'), findsOneWidget);
      await tester.tap(find.text('7 дней'));
      await tester.pumpAndSettle();
      final q = a.calls('GET /reports/dishes').last.queryParameters;
      expect(q['date_from'] == q['date_to'], false);
    });

    testWidgets('filters are sent as repeated parameters', (tester) async {
      final a = await setUpApi({
        'GET /reports/orders': (o) => [],
        'GET /reports/orders/filters': (o) => {
              'waiters': [{'value': 'w1', 'label': 'Alisher'}, {'value': 'w2', 'label': 'Bek'}],
              'cashiers': [],
              'products': [],
            },
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const ReportPage(kind: 'orders')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Фильтры'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alisher'));
      await tester.tap(find.text('Bek'));
      await tester.pump();
      await tester.tap(find.text('Применить'));
      await tester.pumpAndSettle();
      final uri = a.calls('GET /reports/orders').last.uri.toString();
      expect(uri, contains('waiter_id=w1'));
      expect(uri, contains('waiter_id=w2'));
      expect(uri.contains('waiter_id[]'), false, reason: 'FastAPI needs repeated params, not brackets');
    });

    testWidgets('the debtors report has no filter button', (tester) async {
      await setUpApi({'GET /reports/debt-credit': (o) => []}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const ReportPage(kind: 'debt')));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Фильтры'), findsNothing);
    });

    testWidgets('the Z-report shows figures and payment methods', (tester) async {
      final a = await setUpApi({
        'GET /analytics/z-report': (o) => {
              'gross_sales': 100000, 'net_sales': 90000, 'orders_count': 4, 'cancelled_orders_count': 1,
              'payment_methods': [{'method': 'cash', 'count': 3, 'amount': 60000}, {'method': 'card', 'count': 1, 'amount': 30000}],
            },
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const ZReportPage()));
      await tester.pumpAndSettle();
      expect(a.calls('GET /analytics/z-report').single.queryParameters.containsKey('date'), true, reason: 'a single day uses the date mode');
      expect(find.text('90 000 сум'), findsOneWidget);
      expect(find.text('cash ×3'), findsOneWidget);
      await tester.tap(find.text('7 дней'));
      await tester.pumpAndSettle();
      final q = a.calls('GET /analytics/z-report').last.queryParameters;
      expect(q.containsKey('date_from') && q.containsKey('date_to') && !q.containsKey('date'), true, reason: 'a period uses the range mode');
    });
  });

  group('generic resource screens', () {
    testWidgets('lists items, creates a new one with the typed values', (tester) async {
      final a = await setUpApi({
        'GET /units': (o) => [{'id': 'u1', 'name': 'Килограмм', 'short_name': 'кг', 'status': true}],
        'POST /units': (o) => {'id': 'u2'},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      expect(find.text('Килограмм (кг)'), findsOneWidget);
      await tester.tap(find.text('Новая единица'));
      await tester.pumpAndSettle();
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Литр');
      await tester.enterText(f.at(1), 'л');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final body = a.calls('POST /units').single.data as Map;
      expect(body['name'], 'Литр');
      expect(body['short_name'], 'л');
      expect(body['status'], true);
    });

    testWidgets('required fields are validated before sending', (tester) async {
      final a = await setUpApi({'GET /units': (o) => [], 'POST /units': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новая единица'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Заполните: Название'), findsOneWidget);
      expect(a.calls('POST /units'), isEmpty);
    });

    testWidgets('editing patches the item by id', (tester) async {
      final a = await setUpApi({
        'GET /units': (o) => [{'id': 'u1', 'name': 'Штука', 'short_name': 'шт', 'sort': 1, 'status': true}],
        'PATCH /units/u1': (o) => {},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Штука (шт)'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Штучка');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /units/u1').single.data as Map)['name'], 'Штучка');
    });

    testWidgets('deleting asks first, then calls DELETE', (tester) async {
      final a = await setUpApi({
        'GET /units': (o) => [{'id': 'u1', 'name': 'Штука', 'status': true}],
        'DELETE /units/u1': (o) => {},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Штука'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Удалить'));
      await tester.pumpAndSettle();
      expect(a.calls('DELETE /units/u1'), isEmpty);
      await tester.tap(find.text('Удалить').last);
      await tester.pumpAndSettle();
      expect(a.calls('DELETE /units/u1').length, 1);
    });

    testWidgets('a server rejection is shown and the form stays open', (tester) async {
      await setUpApi({
        'GET /units': (o) => [],
        'POST /units': (o) => Reply({'detail': 'Такая единица уже есть'}, status: 409),
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новая единица'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Дубль');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Такая единица уже есть'), findsOneWidget);
      expect(find.text('Сохранить'), findsOneWidget);
    });

    testWidgets('an empty list and an error state are both handled', (tester) async {
      await setUpApi({'GET /units': (o) => []}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(_editableUnits)));
      await tester.pumpAndSettle();
      expect(find.text('Единиц пока нет'), findsOneWidget);
      await setUpApi({'GET /units': (o) => Reply({'detail': 'down'}, status: 500)}, prefs: signedIn);
      await tester.pumpWidget(host(ResourcePage(printersConfig, key: UniqueKey())));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось загрузить'), findsOneWidget);
    });

    testWidgets('printers use a select for the type and default it', (tester) async {
      final a = await setUpApi({'GET /printers': (o) => [], 'POST /printers': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(printersConfig)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новый принтер'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Касса');
      await tester.enterText(find.byType(TextField).at(1), '192.168.1.50');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /printers').single.data as Map;
      expect(b['printer_type'], 'receipt');
      expect(b['ip_address'], '192.168.1.50');
      expect(b['port'], 9100);
    });

    testWidgets('a category creation adds a slug', (tester) async {
      final a = await setUpApi({'GET /inventory/categories': (o) => [], 'POST /inventory/categories': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(dishCategoriesConfig)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новая категория'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Горячие блюда');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /inventory/categories').single.data as Map;
      expect(b['name'], 'Горячие блюда');
      expect(b['slug'], matches(RegExp(r'^goryachie-blyuda-\d+$')));
    });

    testWidgets('a finance category is scoped to its kind', (tester) async {
      final a = await setUpApi({'GET /finance/transaction-categories': (o) => [], 'POST /finance/transaction-categories': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(ResourcePage(transactionCategoriesConfig('expense'))));
      await tester.pumpAndSettle();
      expect(a.calls('GET /finance/transaction-categories').single.queryParameters['kind'], 'expense');
      await tester.tap(find.text('Новая категория'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Аренда');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect((a.calls('POST /finance/transaction-categories').single.data as Map)['kind'], 'expense');
    });
  });

  group('staff', () {
    final users = [
      {'id': 'u1', 'name': 'Owner', 'phone': '+998901112233', 'role_slug': 'owner', 'is_active': true},
      {'id': 'u2', 'name': 'Kassa', 'phone': '+998901112235', 'role_slug': 'cashier', 'is_active': true},
      {'id': 'u3', 'name': 'Official', 'phone': '+998901112236', 'role_slug': 'waiter', 'is_active': false},
    ];

    testWidgets('filters by role and locks the owner card', (tester) async {
      await setUpApi({'GET /auth/users': (o) => users}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffPage()));
      await tester.pumpAndSettle();
      expect(find.text('Kassa'), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.text('Архив'), findsOneWidget);
      await tester.tap(find.text('Официант').first);
      await tester.pumpAndSettle();
      expect(find.text('Kassa'), findsNothing);
      expect(find.text('Official'), findsOneWidget);
    });

    testWidgets('creating an employee: create, then name/active, then PIN', (tester) async {
      final a = await setUpApi({
        'GET /auth/users': (o) => [],
        'POST /auth/users': (o) => {'id': 'n1'},
        'PATCH /auth/users/n1': (o) => {},
        'PATCH /auth/users/n1/pin': (o) => {},
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffPage()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Добавить'));
      await tester.pumpAndSettle();
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Dilnoza');
      await tester.enterText(f.at(1), '+998901234567');
      await tester.enterText(f.at(2), 'Secret1234');
      await tester.enterText(f.at(3), '4321');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final created = a.calls('POST /auth/users').single.data as Map;
      expect(created, {'password': 'Secret1234', 'phone': '+998901234567', 'role_slug': 'cashier'});
      expect(created.containsKey('name'), false, reason: 'the API forbids extra fields on create');
      final patch = a.calls('PATCH /auth/users/n1').single.data as Map;
      expect(patch['name'], 'Dilnoza');
      expect(patch['is_active'], true);
      expect((a.calls('PATCH /auth/users/n1/pin').single.data as Map)['pin'], '4321');
    });

    testWidgets('a short password and a bad PIN are rejected locally', (tester) async {
      final a = await setUpApi({'GET /auth/users': (o) => []}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffPage()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Добавить'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(2), 'short');
      await tester.tap(find.text('Сохранить'));
      await tester.pump();
      expect(find.text('Пароль — минимум 8 символов'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
      await tester.enterText(find.byType(TextField).at(2), 'longenough1');
      await tester.enterText(find.byType(TextField).at(3), '12');
      await tester.tap(find.text('Сохранить'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('PIN должен содержать от 4 до 8 цифр'), findsOneWidget);
      expect(a.calls('POST /auth/users'), isEmpty);
      await tester.pump(const Duration(seconds: 4));
    });

    testWidgets('editing keeps the password unchanged when left empty', (tester) async {
      final a = await setUpApi({'GET /auth/users': (o) => users, 'PATCH /auth/users/u2': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffPage()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kassa'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final patch = a.calls('PATCH /auth/users/u2').single.data as Map;
      expect(patch.containsKey('password'), false);
      expect(patch['role_slug'], 'cashier');
      expect(a.calls('PATCH /auth/users/u2/pin'), isEmpty);
    });

    testWidgets('archiving an employee is confirmed and uses DELETE', (tester) async {
      final a = await setUpApi({'GET /auth/users': (o) => users, 'DELETE /auth/users/u2': (o) => {}}, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffPage()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kassa'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Архивировать'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Архивировать').last);
      await tester.pumpAndSettle();
      expect(a.calls('DELETE /auth/users/u2').length, 1);
    });

    testWidgets('login history and attendance journals render rows', (tester) async {
      await setUpApi({
        'GET /hr/login-history': (o) => [{'date': '2026-09-25', 'employee': 'Kassa', 'role': 'cashier', 'device': 'Android', 'login': '09:00', 'logout': '18:00', 'status': 'ok'}],
      }, prefs: signedIn);
      usePhone(tester);
      await tester.pumpWidget(host(const StaffActivityPage(type: 'login-history')));
      await tester.pumpAndSettle();
      expect(find.text('Kassa'), findsOneWidget);
      expect(find.text('Android'), findsOneWidget);
    });
  });
}
