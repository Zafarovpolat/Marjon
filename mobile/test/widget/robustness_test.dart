import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/app.dart';
import 'package:marjon_mobile/src/features/panels/attendance_panel.dart';
import 'package:marjon_mobile/src/features/panels/batch_print_panel.dart';
import 'package:marjon_mobile/src/features/panels/finance_panel.dart';
import 'package:marjon_mobile/src/features/panels/history_panel.dart';
import 'package:marjon_mobile/src/features/panels/reports_panel.dart';
import 'package:marjon_mobile/src/features/panels/staff_panel.dart';
import 'package:marjon_mobile/src/features/panels/stop_list_panel.dart';
import 'package:marjon_mobile/src/features/panels/warehouse_panel.dart';
import 'package:marjon_mobile/src/session/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

// Whatever the server answers, no screen may crash.

final _user = {'role_slugs': ['cashier'], 'branch_id': 'b1', 'permissions': {'can_cash_ops': true, 'can_view_z_report': true, 'can_edit_stop_list': true}};

final _pages = <String, Widget Function()>{
  'attendance': () => AttendancePanel(user: _user),
  'finance': () => FinancePanel(user: _user, branchId: 'b1'),
  'history': () => const HistoryPanel(branchId: 'b1'),
  'reports': () => ReportsPanel(user: _user, branchId: 'b1'),
  'staff': () => const StaffPanel(),
  'warehouse': () => const WarehousePanel(),
  'stop-list': () => StopListPanel(user: _user),
  'batch print': () => const BatchPrintPanel(branchId: 'b1'),
};

final _payloads = <String, Object?>{
  'null body': null,
  'plain string': 'Bad Gateway',
  'empty object': <String, Object?>{},
  'list of junk': [1, 'a', null, true],
  'wrong types': {'items': 'nope', 'name': 5, 'price': 'abc', 'id': 7},
};

Map<String, Object> get _prefs => {'marjon_org_token': 'ORG', 'marjon_token': 'S'};

void main() {
  for (final p in _payloads.entries) {
    for (final e in _pages.entries) {
      testWidgets('${e.key} survives "${p.key}"', (tester) async {
        usePhone(tester);
        await setUpApi({'GET *': (o) => p.value, 'POST *': (o) => p.value, 'PATCH *': (o) => p.value}, prefs: _prefs);
        await tester.pumpWidget(shell(e.value()));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 1));
      });
    }
  }

  for (final status in [401, 403, 404, 500]) {
    for (final e in _pages.entries) {
      testWidgets('${e.key} survives HTTP $status', (tester) async {
        usePhone(tester);
        await setUpApi({'GET *': (o) => Reply({'detail': 'no'}, status: status), 'POST /auth/refresh': (o) => Reply({'detail': 'no'}, status: 401)}, prefs: _prefs);
        await tester.pumpWidget(shell(e.value()));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 1));
      });
    }
  }

  for (final e in _pages.entries) {
    testWidgets('${e.key} survives an unreachable server', (tester) async {
      usePhone(tester);
      await setUpApi({'GET *': (o) => throw NetDown()}, prefs: _prefs);
      await tester.pumpWidget(shell(e.value()));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
    });
  }

  for (final role in ['cashier', 'waiter', 'kitchen']) {
    for (final p in _payloads.entries) {
      testWidgets('$role workspace survives "${p.key}"', (tester) async {
        usePhone(tester);
        await setUpApi({'GET *': (o) => p.value, 'POST *': (o) => p.value, 'PATCH *': (o) => p.value}, prefs: {
          'marjon_org_token': 'org-1',
          'marjon_org_user': '{"name":"Marjon Cafe","company_name":"Marjon Cafe"}',
          'marjon_branch': '{"id":"b1","name":"Central"}',
          'marjon_token': 'staff-1',
          'marjon_user': '{"id":"u1","name":"Dilnoza","role_slugs":["$role"],"branch_id":"b1"}',
          'marjon_mode': role,
          'marjon_server_url': 'http://127.0.0.1:1/api/v1',
        });
        await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: Session(), child: const MarjonApp()));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 250));
        }
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 1));
      });
    }
  }
}
