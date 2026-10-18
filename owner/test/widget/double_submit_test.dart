import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/features/common/resource_page.dart';
import 'package:marjon_owner/src/features/common/resources.dart';
import 'package:marjon_owner/src/features/finance/finance_pages.dart';
import 'package:marjon_owner/src/features/menu/dish_pages.dart';
import 'package:marjon_owner/src/features/staff/staff_pages.dart';
import 'package:marjon_owner/src/features/warehouse/warehouse_pages.dart';

import '../helpers.dart';

// A nervous double tap on "Save" must not create two records.

Future<void> _doubleTapSave(WidgetTester tester) async {
  final save = find.text('Сохранить');
  await tester.scrollUntilVisible(save, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  final c = tester.getCenter(save);
  await tester.tapAt(c);
  await tester.tapAt(c); // no pump in between: same frame
  await tester.pumpAndSettle();
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
  Future<void> open(WidgetTester tester, Widget page) async {
    usePhone(tester);
    await tester.pumpWidget(host(page));
    await tester.pumpAndSettle();
  }

  testWidgets('resource form (unit)', (tester) async {
    final a = await setUpApi({'GET /units': (o) => [], 'POST /units': (o) => {'id': 'x'}}, prefs: signedIn);
    await open(tester, ResourcePage(_editableUnits));
    await tester.tap(find.text('Новая единица'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Литр');
    await _doubleTapSave(tester);
    expect(a.calls('POST /units').length, 1);
  });

  testWidgets('staff form', (tester) async {
    final a = await setUpApi({'POST /auth/users': (o) => {'id': 'n1'}, 'PATCH /auth/users/n1': (o) => {}}, prefs: signedIn);
    await open(tester, const StaffForm());
    await tester.enterText(find.byType(TextField).at(2), 'Secret1234');
    await _doubleTapSave(tester);
    expect(a.calls('POST /auth/users').length, 1);
  });

  testWidgets('transaction form', (tester) async {
    final a = await setUpApi({
      'GET /finance/transaction-categories': (o) => [],
      'GET /finance/payment-types': (o) => {'items': []},
      'POST /finance/transactions': (o) => {'id': 'x'},
    }, prefs: signedIn);
    await open(tester, const TransactionForm());
    await tester.enterText(find.byType(TextField).at(0), '1000');
    await _doubleTapSave(tester);
    expect(a.calls('POST /finance/transactions').length, 1);
  });

  testWidgets('purchase form', (tester) async {
    final a = await setUpApi({'POST /warehouse/purchases': (o) => {'id': 'x'}}, prefs: signedIn);
    await open(tester, const PurchaseForm());
    final f = find.byType(TextField);
    await tester.enterText(f.at(1), 'Склад');
    await tester.enterText(f.at(2), 'Мука');
    await _doubleTapSave(tester);
    expect(a.calls('POST /warehouse/purchases').length, 1);
  });

  testWidgets('dish form', (tester) async {
    final a = await setUpApi({
      'GET /inventory/categories': (o) => [],
      'GET /printers': (o) => [],
      'POST /inventory/products': (o) => {'id': 'x', 'name': 'A', 'price': 1},
      'GET /inventory/products/x/modifier-groups': (o) => [],
    }, prefs: signedIn);
    await open(tester, const DishEditPage());
    await tester.enterText(find.byType(TextField).at(0), 'Самса');
    await tester.enterText(find.byType(TextField).at(1), '9000');
    await _doubleTapSave(tester);
    expect(a.calls('POST /inventory/products').length, 1);
  });

  testWidgets('saving a just-created dish again updates it instead of creating a duplicate', (tester) async {
    final a = await setUpApi({
      'GET /inventory/categories': (o) => [],
      'GET /printers': (o) => [],
      'POST /inventory/products': (o) => {'id': 'x', 'name': 'Самса', 'price': 9000},
      'PATCH /inventory/products/x': (o) => {},
      'GET /inventory/products/x/modifier-groups': (o) => [],
    }, prefs: signedIn);
    await open(tester, const DishEditPage());
    await tester.enterText(find.byType(TextField).at(0), 'Самса');
    await tester.enterText(find.byType(TextField).at(1), '9000');
    await _doubleTapSave(tester);
    await tester.pump(const Duration(seconds: 4));
    await _doubleTapSave(tester);
    expect(a.calls('POST /inventory/products').length, 1);
    expect(a.calls('PATCH /inventory/products/x').length, 1);
  });
}
