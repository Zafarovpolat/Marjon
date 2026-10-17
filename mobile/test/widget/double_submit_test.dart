import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/features/panels/attendance_panel.dart';
import 'package:marjon_mobile/src/features/panels/finance_panel.dart';
import 'package:marjon_mobile/src/features/panels/staff_panel.dart';
import 'package:marjon_mobile/src/features/panels/warehouse_panel.dart';
import 'package:marjon_mobile/src/i18n/strings.dart';

import '../helpers.dart';

// A nervous double tap must not create two records / two cash operations.

final _user = {'role_slugs': ['cashier'], 'permissions': {'can_cash_ops': true}};

Future<void> _doubleTap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  final c = tester.getCenter(f);
  await tester.tapAt(c);
  await tester.tapAt(c);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cash income is posted once', (tester) async {
    usePhone(tester);
    final a = await setUpApi({
      'GET /pos/shifts/current': (o) => {'id': 's1', 'status': 'open', 'opening_cash': 0},
      'GET /finance/income-expense': (o) => {'items': []},
      'POST /finance/income-expense': (o) => {'id': 'x'},
    });
    await tester.pumpWidget(shell(FinancePanel(user: _user, branchId: 'b1')));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, t('amount_sum')), '5000');
    await _doubleTap(tester, find.text(t('income')));
    expect(a.calls('POST /finance/income-expense').length, 1);
  });

  testWidgets('a shift is opened once', (tester) async {
    usePhone(tester);
    final a = await setUpApi({
      'GET /pos/shifts/current': (o) => <String, Object?>{},
      'GET /finance/income-expense': (o) => {'items': []},
      'POST /pos/shifts/open': (o) => {'id': 's1', 'status': 'open'},
    });
    await tester.pumpWidget(shell(FinancePanel(user: _user, branchId: 'b1')));
    await tester.pumpAndSettle();
    await _doubleTap(tester, find.text(t('open_shift')));
    expect(a.calls('POST /pos/shifts/open').length, 1);
  });

  testWidgets('attendance is marked once', (tester) async {
    usePhone(tester);
    final a = await setUpApi({
      'GET /auth/branch-colleagues': (o) => [{'id': 'w1', 'name': 'Alisher', 'role_slug': 'waiter', 'is_active': true}],
      'GET /hr/attendance/log': (o) => [],
      'GET /hr/attendance/pending': (o) => [],
      'POST /hr/attendance/mark': (o) => {'id': 'l'},
    }, prefs: {'marjon_org_token': 'ORG'});
    await tester.pumpWidget(shell(AttendancePanel(user: _user)));
    await tester.pumpAndSettle();
    await _doubleTap(tester, find.text(t('att_mark_in')).first);
    expect(a.calls('POST /hr/attendance/mark').length, 1);
  });

  testWidgets('an employee is created once', (tester) async {
    usePhone(tester);
    final a = await setUpApi({'GET /auth/users': (o) => [], 'POST /auth/users': (o) => {'id': 'n1'}, 'PATCH /auth/users/n1': (o) => {}});
    await tester.pumpWidget(shell(const StaffPanel()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip(t('staff_add')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Dilnoza');
    await tester.enterText(find.byType(TextField).at(2), 'Secret1234');
    await _doubleTap(tester, find.text(t('save')));
    expect(a.calls('POST /auth/users').length, 1);
  });

  testWidgets('a warehouse record is created once', (tester) async {
    usePhone(tester);
    final a = await setUpApi({'GET /warehouse/write-offs': (o) => [], 'POST /warehouse/write-offs': (o) => {'id': 'w'}, 'GET /warehouse/purchases': (o) => []});
    await tester.pumpWidget(shell(const WarehousePanel()));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ChoiceChip).first, const Offset(-300, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text(t('wh_tab_writeoff')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(t('wh_add')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Порча');
    await _doubleTap(tester, find.text(t('save')));
    expect(a.calls('POST /warehouse/write-offs').length, 1);
  });
}
