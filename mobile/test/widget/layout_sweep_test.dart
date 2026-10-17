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
import 'package:marjon_mobile/src/features/settings/privacy_page.dart';
import 'package:marjon_mobile/src/session/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

// Every screen must lay out without overflow on a small phone (320x568) and a large one,
// in both languages (Uzbek strings are longer). Overflow = a Flutter exception = a failing test.

final _cashier = {
  'role_slugs': ['cashier'],
  'branch_id': 'b1',
  'permissions': {
    'can_cash_ops': true,
    'can_view_z_report': true,
    'can_edit_stop_list': true,
    'can_manage_staff': true,
  },
};

Map<String, Handler> _routes() => {
  'GET /auth/branch-colleagues':
      (o) => [
        {
          'id': 'w1',
          'name': 'Алишер Абдукадиров',
          'role_slug': 'waiter',
          'is_active': true,
          'phone': '+998901112233',
        },
        {
          'id': 'c1',
          'name': 'Дилноза',
          'role_slug': 'cashier',
          'is_active': true,
        },
      ],
  'GET /auth/users':
      (o) => [
        {
          'id': 'w1',
          'name': 'Алишер Абдукадиров',
          'role_slug': 'waiter',
          'is_active': true,
        },
        {
          'id': 'o1',
          'name': 'Владелец',
          'role_slug': 'owner',
          'is_active': true,
        },
      ],
  'GET /auth/active-staff': (o) => ['w1'],
  'GET /hr/attendance/log':
      (o) => [
        {
          'id': 'l1',
          'user_id': 'w1',
          'action': 'check_in',
          'employee_name': 'Алишер Абдукадиров',
          'timestamp': '2026-09-25T08:00:00',
        },
      ],
  'GET /hr/attendance/pending':
      (o) => [
        {
          'id': 'p1',
          'user_id': 'c1',
          'action': 'check_out',
          'employee_name': 'Дилноза',
          'timestamp': '2026-09-25T09:00:00',
        },
      ],
  'GET /pos/shifts/current':
      (o) => {
        'id': 's1',
        'status': 'open',
        'opening_cash': 1500000,
        'opened_at': '2026-09-25T08:00:00',
      },
  'GET /finance/income-expense':
      (o) => {
        'items': [
          {
            'id': 't1',
            'direction': 'expense',
            'amount': 1250000,
            'comment': 'Закупка мяса у поставщика на неделю вперёд',
            'date': '2026-09-25T10:00:00',
          },
        ],
      },
  'GET /pos/orders':
      (o) => [
        {
          'id': '1',
          'order_number': '1234',
          'order_type': 'delivery',
          'status': 'cancelled',
          'created_at': '2026-09-25T10:00:00',
        },
        {
          'id': '2',
          'order_number': '1235',
          'order_type': 'dine_in',
          'table_number': '12',
          'status': 'paid',
          'created_at': '2026-09-25T10:30:00',
        },
      ],
  'GET /reports/dishes':
      (o) => [
        {
          'name': 'Плов Ташкентский с бараниной',
          'quantity': 12,
          'total': 12345678,
          'unit': 'порц',
        },
      ],
  'GET /inventory/products':
      (o) => [
        {
          'id': 'p1',
          'name': 'Плов Ташкентский с бараниной и нутом',
          'price': 35000,
          'is_available': false,
          'daily_limit': 10,
          'sold_count': 4,
        },
      ],
  'GET /warehouse/purchases':
      (o) => [
        {
          'id': 'w',
          'number': 1,
          'supplier': 'ООО «Очень длинное название поставщика»',
          'created_by_name': 'Менеджер Иванов',
        },
      ],
  'GET /printers': (o) => [],
};

const _sizes = [(320.0, 568.0), (360.0, 800.0), (412.0, 915.0)];

void main() {
  for (final lang in ['ru', 'uz']) {
    for (final (w, h) in _sizes) {
      final tag = '$lang ${w.toInt()}x${h.toInt()}';

      Future<void> open(WidgetTester tester, Widget page) async {
        useScreen(tester, w, h);
        await setUpApi(
          _routes(),
          prefs: {'marjon_org_token': 'ORG', 'marjon_lang': lang},
        );
        await tester.pumpWidget(shell(page));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
      }

      final pages = <String, Widget Function()>{
        'attendance': () => AttendancePanel(user: _cashier),
        'finance': () => FinancePanel(user: _cashier, branchId: 'b1'),
        'history': () => const HistoryPanel(branchId: 'b1'),
        'reports': () => ReportsPanel(user: _cashier, branchId: 'b1'),
        'staff': () => const StaffPanel(),
        'warehouse': () => const WarehousePanel(),
        'stoplist': () => StopListPanel(user: _cashier),
        'batchprint': () => const BatchPrintPanel(branchId: 'b1'),
        'privacy': () => const PrivacyPage(),
      };
      for (final e in pages.entries) {
        testWidgets('${e.key} lays out without overflow — $tag', (
          tester,
        ) async {
          await open(tester, e.value());
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 1));
        });
      }

      testWidgets('staff login screen lays out without overflow — $tag', (
        tester,
      ) async {
        useScreen(tester, w, h);
        await setUpApi(
          _routes(),
          prefs: {
            'marjon_lang': lang,
            'marjon_server_url': 'http://127.0.0.1:1/api/v1',
          },
        );
        final s = Session();
        await tester.pumpWidget(
          ChangeNotifierProvider<Session>.value(
            value: s,
            child: const MarjonApp(),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));
        // One screen now: phone + password sign straight into the workplace.
        expect(find.byType(TextField), findsNWidgets(2));
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 1));
      });

      for (final role in ['cashier', 'waiter', 'kitchen']) {
        testWidgets('$role workspace lays out without overflow — $tag', (
          tester,
        ) async {
          useScreen(tester, w, h);
          await setUpApi(
            {
              ..._routes(),
              'GET /halls':
                  (o) => [
                    {
                      'id': 'h1',
                      'name': 'Зал',
                      'tables': [
                        for (var i = 1; i <= 12; i++)
                          {'id': 't$i', 'number': i, 'capacity': 4},
                      ],
                    },
                    {
                      'id': 'h2',
                      'name': 'Веранда на втором этаже',
                      'tables': [],
                    },
                  ],
              'GET /inventory/categories':
                  (o) => [
                    {'id': 'c1', 'name': 'Горячие блюда'},
                  ],
              'GET /kitchen/orders':
                  (o) => [
                    {
                      'id': 'k1',
                      'order_number': '5',
                      'table_number': '3',
                      'status': 'new',
                      'created_at': DateTime.now().toIso8601String(),
                      'items': [
                        {
                          'id': 'i1',
                          'name': 'Плов Ташкентский с бараниной',
                          'quantity': 2,
                          'status': 'new',
                        },
                      ],
                    },
                  ],
            },
            prefs: {
              'marjon_org_token': 'org-1',
              'marjon_org_user':
                  '{"name":"Marjon Cafe","company_name":"Marjon Cafe"}',
              'marjon_branch': '{"id":"b1","name":"Central"}',
              'marjon_token': 'staff-1',
              'marjon_user':
                  '{"id":"u1","name":"Dilnoza","role_slugs":["$role"],"branch_id":"b1"}',
              'marjon_mode': role,
              'marjon_lang': lang,
              'marjon_server_url': 'http://127.0.0.1:1/api/v1',
            },
          );
          final s = Session();
          await tester.pumpWidget(
            ChangeNotifierProvider<Session>.value(
              value: s,
              child: const MarjonApp(),
            ),
          );
          for (var i = 0; i < 6; i++) {
            await tester.pump(const Duration(milliseconds: 250));
          }
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 1));
        });
      }
    }
  }
}
