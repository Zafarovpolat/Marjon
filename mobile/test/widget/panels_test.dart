import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/features/panels/attendance_panel.dart';
import 'package:marjon_mobile/src/features/panels/batch_print_panel.dart';
import 'package:marjon_mobile/src/features/panels/finance_panel.dart';
import 'package:marjon_mobile/src/features/panels/history_panel.dart';
import 'package:marjon_mobile/src/features/panels/reports_panel.dart';
import 'package:marjon_mobile/src/features/panels/staff_panel.dart';
import 'package:marjon_mobile/src/features/panels/stop_list_panel.dart';
import 'package:marjon_mobile/src/features/panels/warehouse_panel.dart';
import 'package:marjon_mobile/src/i18n/strings.dart';

import '../helpers.dart';

const _org = {'marjon_org_token': 'ORG'};
final _cashier = {'role_slugs': ['cashier'], 'branch_id': 'b1', 'permissions': {'can_cash_ops': true, 'can_view_z_report': true, 'can_edit_stop_list': true}};

void main() {
  group('AttendancePanel', () {
    testWidgets('lists staff, marks arrival and shows the journal', (tester) async {
      usePhone(tester);
      var marked = false;
      final a = await setUpApi({
        'GET /auth/branch-colleagues': (o) => [
              {'id': 'w1', 'name': 'Alisher', 'role_slug': 'waiter', 'is_active': true},
              {'id': 'o1', 'name': 'The Owner', 'role_slug': 'owner', 'is_active': true},
            ],
        'GET /hr/attendance/log': (o) => marked ? [{'id': 'l1', 'user_id': 'w1', 'action': 'check_in', 'employee_name': 'Alisher', 'timestamp': '2026-09-25T08:00:00'}] : [],
        'GET /hr/attendance/pending': (o) => [],
        'POST /hr/attendance/mark': (o) {
          marked = true;
          return {'id': 'l1'};
        },
      }, prefs: _org);
      await tester.pumpWidget(shell(AttendancePanel(user: _cashier)));
      await tester.pumpAndSettle();
      expect(find.text('Alisher'), findsOneWidget);
      expect(find.text('The Owner'), findsNothing, reason: 'owners are hidden from the roster');
      await tester.tap(find.text(t('att_mark_in')).first);
      await tester.pumpAndSettle();
      final body = a.calls('POST /hr/attendance/mark').single.data as Map;
      expect(body['user_id'], 'w1');
      expect(body['action'], 'check_in');
      expect(find.text(t('att_on_shift')), findsWidgets);
    });

    testWidgets('approves a pending self-mark', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /auth/branch-colleagues': (o) => [],
        'GET /hr/attendance/log': (o) => [],
        'GET /hr/attendance/pending': (o) => [{'id': 'p1', 'user_id': 'u', 'action': 'check_in', 'employee_name': 'Bek', 'timestamp': '2026-09-25T09:00:00'}],
        'POST /hr/attendance/p1/approve': (o) => {'ok': true},
      }, prefs: _org);
      await tester.pumpWidget(shell(AttendancePanel(user: _cashier)));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining(t('att_pending')));
      await tester.pumpAndSettle();
      expect(find.text('Bek'), findsOneWidget);
      await tester.tap(find.byTooltip(t('att_approve')));
      await tester.pumpAndSettle();
      expect((a.calls('POST /hr/attendance/p1/approve').single.data as Map)['approve'], true);
      expect(find.text('Bek'), findsNothing);
    });
  });

  group('FinancePanel', () {
    testWidgets('opens a shift with the entered cash', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /pos/shifts/current': (o) => <String, Object?>{},
        'GET /finance/income-expense': (o) => {'items': []},
        'POST /pos/shifts/open': (o) => {'id': 's1', 'status': 'open'},
      });
      await tester.pumpWidget(shell(FinancePanel(user: _cashier, branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '150000');
      await tester.tap(find.text(t('open_shift')));
      await tester.pumpAndSettle();
      final body = a.calls('POST /pos/shifts/open').single.data as Map;
      expect(body['branch_id'], 'b1');
      expect(body['opening_cash'], 150000);
    });

    testWidgets('records an expense and lists operations', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /pos/shifts/current': (o) => {'id': 's1', 'status': 'open', 'opening_cash': 100000, 'opened_at': '2026-09-25T08:00:00'},
        'GET /finance/income-expense': (o) => {'items': [{'id': 't1', 'direction': 'expense', 'amount': 5000, 'comment': 'Хлеб', 'date': '2026-09-25T10:00:00'}]},
        'POST /finance/income-expense': (o) => {'id': 't2'},
      });
      await tester.pumpWidget(shell(FinancePanel(user: _cashier, branchId: 'b1')));
      await tester.pumpAndSettle();
      expect(find.text('Хлеб'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, t('amount_sum')), '7000');
      await tester.enterText(find.widgetWithText(TextField, t('comment')), 'Лёд');
      await tester.ensureVisible(find.text(t('expense')));
      await tester.tap(find.text(t('expense')));
      await tester.pumpAndSettle();
      final body = a.calls('POST /finance/income-expense').single.data as Map;
      expect(body['direction'], 'expense');
      expect(body['amount'], 7000);
      expect(body['comment'], 'Лёд');
    });

    testWidgets('cash operations are hidden without the permission', (tester) async {
      usePhone(tester);
      await setUpApi({
        'GET /pos/shifts/current': (o) => <String, Object?>{},
        'GET /finance/income-expense': (o) => {'items': []},
      });
      await tester.pumpWidget(shell(FinancePanel(user: {'role_slugs': ['waiter']}, branchId: 'b1')));
      await tester.pumpAndSettle();
      expect(find.text(t('income_expense').toUpperCase()), findsNothing);
    });
  });

  group('HistoryPanel', () {
    testWidgets('filters orders by type', (tester) async {
      usePhone(tester);
      await setUpApi({
        'GET /pos/orders': (o) => [
              {'id': '1', 'order_number': '11', 'order_type': 'dine_in', 'table_number': '3', 'status': 'paid', 'created_at': '2026-09-25T10:00:00'},
              {'id': '2', 'order_number': '12', 'order_type': 'delivery', 'status': 'cancelled', 'created_at': '2026-09-25T11:00:00'},
            ],
      });
      await tester.pumpWidget(shell(const HistoryPanel(branchId: 'b1')));
      await tester.pumpAndSettle();
      expect(find.text('#11'), findsOneWidget);
      expect(find.text('#12'), findsOneWidget);
      await tester.drag(find.byType(ChoiceChip).first, const Offset(-400, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('delivery')).first);
      await tester.pumpAndSettle();
      expect(find.text('#11'), findsNothing);
      expect(find.text('#12'), findsOneWidget);
    });

    testWidgets('shows the empty state', (tester) async {
      usePhone(tester);
      await setUpApi({'GET /pos/orders': (o) => []});
      await tester.pumpWidget(shell(const HistoryPanel(branchId: 'b1')));
      await tester.pumpAndSettle();
      expect(find.text(t('no_orders_found')), findsOneWidget);
    });
  });

  group('ReportsPanel', () {
    testWidgets('generates the dishes report with the period', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /reports/dishes': (o) => [{'name': 'Плов', 'quantity': 3, 'total': 105000}],
      });
      await tester.pumpWidget(shell(ReportsPanel(user: _cashier, branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('generate')));
      await tester.pumpAndSettle();
      expect(find.text('105 000'), findsOneWidget);
      final q = a.calls('GET /reports/dishes').single.queryParameters;
      expect(q['branch_id'], 'b1');
      expect(q['date_from'], q['date_to']);
    });

    testWidgets('Z-report tab requires the permission', (tester) async {
      usePhone(tester);
      await setUpApi({});
      await tester.pumpWidget(shell(ReportsPanel(user: {'role_slugs': ['cashier'], 'permissions': {'can_view_z_report': false}}, branchId: 'b1')));
      await tester.pumpAndSettle();
      expect(find.text(t('rep_z')), findsNothing);
    });

    testWidgets('renders the Z-report figures', (tester) async {
      usePhone(tester);
      await setUpApi({
        'GET /analytics/z-report': (o) => {'net_sales': 78400, 'orders_count': 4, 'payment_methods': [{'method': 'cash', 'count': 4, 'amount': 78400}]},
      });
      await tester.pumpWidget(shell(ReportsPanel(user: _cashier, branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ChoiceChip).first, const Offset(-400, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('rep_z')));
      await tester.pumpAndSettle();
      expect(find.textContaining('78 400'), findsWidgets);
    });

    testWidgets('report error is reported, not swallowed', (tester) async {
      usePhone(tester);
      await setUpApi({'GET /reports/dishes': (o) => Reply({'detail': 'boom'}, status: 500)});
      await tester.pumpWidget(shell(ReportsPanel(user: _cashier, branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('generate')));
      await tester.pumpAndSettle();
      expect(find.text(t('rep_unavailable')), findsOneWidget);
    });
  });

  group('StaffPanel', () {
    testWidgets('lists users and locks the owner card', (tester) async {
      usePhone(tester);
      await setUpApi({
        'GET /auth/users': (o) => [
              {'id': 'u1', 'name': 'Kassa', 'role_slug': 'cashier', 'is_active': true},
              {'id': 'u2', 'name': 'Boss', 'role_slug': 'owner', 'is_active': true},
            ],
      });
      await tester.pumpWidget(shell(const StaffPanel()));
      await tester.pumpAndSettle();
      expect(find.text('Kassa'), findsOneWidget);
      expect(find.text(t('staff_readonly')), findsOneWidget);
    });

    testWidgets('creating a user goes create -> patch name -> set pin', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /auth/users': (o) => [],
        'POST /auth/users': (o) => {'id': 'new1'},
        'PATCH /auth/users/new1': (o) => {'id': 'new1'},
        'PATCH /auth/users/new1/pin': (o) => {'ok': true},
      });
      await tester.pumpWidget(shell(const StaffPanel()));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip(t('staff_add')));
      await tester.pumpAndSettle();
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'Dilnoza');
      await tester.enterText(fields.at(1), '+998901234567');
      await tester.enterText(fields.at(2), 'Secret123');
      await tester.enterText(fields.at(3), '4321');
      await tester.tap(find.text(t('save')));
      await tester.pumpAndSettle();
      final created = a.calls('POST /auth/users').single.data as Map;
      expect(created['password'], 'Secret123');
      expect(created['role_slug'], 'cashier');
      expect(created.containsKey('name'), false, reason: 'backend rejects unknown fields on create');
      expect((a.calls('PATCH /auth/users/new1').single.data as Map)['name'], 'Dilnoza');
      expect((a.calls('PATCH /auth/users/new1/pin').single.data as Map)['pin'], '4321');
    });

    testWidgets('a short password is rejected before any request', (tester) async {
      usePhone(tester);
      final a = await setUpApi({'GET /auth/users': (o) => []});
      await tester.pumpWidget(shell(const StaffPanel()));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip(t('staff_add')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'X');
      await tester.enterText(find.byType(TextField).at(2), 'short');
      await tester.tap(find.text(t('save')));
      await tester.pump();
      expect(a.calls('POST /auth/users'), isEmpty);
    });
  });

  group('WarehousePanel', () {
    testWidgets('purchase requires a warehouse and an item', (tester) async {
      usePhone(tester);
      final a = await setUpApi({'GET /warehouse/purchases': (o) => [], 'POST /warehouse/purchases': (o) => {'id': 'p'}});
      await tester.pumpWidget(shell(const WarehousePanel()));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('wh_add')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('save')));
      await tester.pump();
      expect(a.calls('POST /warehouse/purchases'), isEmpty);
    });

    testWidgets('saves a purchase with items', (tester) async {
      usePhone(tester);
      final a = await setUpApi({'GET /warehouse/purchases': (o) => [], 'POST /warehouse/purchases': (o) => {'id': 'p'}});
      await tester.pumpWidget(shell(const WarehousePanel()));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('wh_add')));
      await tester.pumpAndSettle();
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Baraka');
      await tester.enterText(f.at(1), 'Main');
      await tester.enterText(f.at(2), 'Мука');
      await tester.enterText(f.at(3), '10');
      await tester.enterText(f.at(4), '8000');
      await tester.ensureVisible(find.text(t('save')));
      await tester.tap(find.text(t('save')));
      await tester.pumpAndSettle();
      final body = a.calls('POST /warehouse/purchases').single.data as Map;
      expect(body['supplier'], 'Baraka');
      expect(body['warehouse_name'], 'Main');
      expect((body['items'] as List).single['name'], 'Мука');
      expect((body['items'] as List).single['quantity'], 10);
    });
  });

  group('StopListPanel', () {
    testWidgets('puts a dish into the stop list', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /inventory/products': (o) => [{'id': 'p1', 'name': 'Плов', 'price': 35000, 'is_available': true}],
        'PATCH /inventory/products/p1/availability': (o) => {'id': 'p1'},
      });
      await tester.pumpWidget(shell(StopListPanel(user: _cashier)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Плов'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('to_stop')));
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /inventory/products/p1/availability').single.data as Map)['is_available'], false);
    });

    testWidgets('read-only without the edit permission', (tester) async {
      usePhone(tester);
      await setUpApi({'GET /inventory/products': (o) => [{'id': 'p1', 'name': 'Плов', 'price': 1, 'is_available': true}]});
      await tester.pumpWidget(shell(StopListPanel(user: {'permissions': {'can_edit_stop_list': false}})));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Плов'));
      await tester.pumpAndSettle();
      expect(find.text(t('to_stop')), findsNothing);
    });
  });

  group('BatchPrintPanel', () {
    testWidgets('prints the accounts summary on the receipt printer', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /auth/branch-colleagues': (o) => [{'id': 'u1', 'name': 'Kassa', 'role_slug': 'cashier', 'phone': '+998901112235'}],
        'GET /printers': (o) => [{'id': 'pr1', 'printer_type': 'receipt', 'branch_id': 'b1'}],
        'POST /printers/print/summary': (o) => {'ok': true},
      }, prefs: _org);
      await tester.pumpWidget(shell(const BatchPrintPanel(branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('dev_accounts')));
      await tester.pumpAndSettle();
      final body = a.calls('POST /printers/print/summary').single.data as Map;
      expect(body['printer_id'], 'pr1');
      expect((body['lines'] as List).single, contains('Kassa'));
      expect(find.text(t('receipt_sent')), findsOneWidget);
    });

    testWidgets('warns when no receipt printer is configured', (tester) async {
      usePhone(tester);
      final a = await setUpApi({
        'GET /auth/branch-colleagues': (o) => [{'id': 'u1', 'name': 'Kassa'}],
        'GET /printers': (o) => [],
      }, prefs: _org);
      await tester.pumpWidget(shell(const BatchPrintPanel(branchId: 'b1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('dev_accounts')));
      await tester.pumpAndSettle();
      expect(a.calls('POST /printers/print/summary'), isEmpty);
      expect(find.text(t('no_receipt_printer')), findsOneWidget);
    });
  });
}
