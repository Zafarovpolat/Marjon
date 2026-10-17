import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/features/common/resource_page.dart';
import 'package:marjon_owner/src/features/common/resources.dart';
import 'package:marjon_owner/src/features/finance/finance_pages.dart';
import 'package:marjon_owner/src/features/menu/dish_pages.dart';
import 'package:marjon_owner/src/features/menu/menu_pages.dart';
import 'package:marjon_owner/src/features/settings/privacy_page.dart';
import 'package:marjon_owner/src/features/settings/receipt_page.dart';
import 'package:marjon_owner/src/features/settings/settings_pages.dart';
import 'package:marjon_owner/src/features/settings/support_page.dart';
import 'package:marjon_owner/src/features/warehouse/warehouse_pages.dart';

import '../helpers.dart';

Future<void> _open(WidgetTester tester, Widget page) async {
  usePhone(tester);
  await tester.pumpWidget(host(page));
  await tester.pumpAndSettle();
}

/// Scrolls a lazily built list until [finder] exists on screen.
Future<void> _reveal(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  group('menu', () {
    testWidgets('the menu hub links to dishes, categories and the stop-list', (tester) async {
      await setUpApi({});
      await _open(tester, const MenuHubPage());
      expect(find.text('Блюда'), findsOneWidget);
      expect(find.text('Категории блюд'), findsOneWidget);
      expect(find.text('Стоп-лист'), findsOneWidget);
    });

    testWidgets('the stop-list switch patches availability and counts stopped dishes', (tester) async {
      final a = await setUpApi({
        'GET /inventory/products': (o) => [
              {'id': 'p1', 'name': 'Плов', 'price': 35000, 'is_available': true},
              {'id': 'p2', 'name': 'Лагман', 'price': 32000, 'is_available': false},
            ],
        'PATCH /inventory/products/p1/availability': (o) => {},
      }, prefs: signedIn);
      await _open(tester, const StopListPage());
      expect(find.text('Стоп-лист · 1'), findsOneWidget);
      expect(find.text('В стоп-листе'), findsOneWidget);
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect((a.calls('PATCH /inventory/products/p1/availability').single.data as Map)['is_available'], false);
      expect(find.text('Стоп-лист · 2'), findsOneWidget);
    });

    testWidgets('a failed availability change is reverted and reported', (tester) async {
      var fail = true;
      await setUpApi({
        'GET /inventory/products': (o) => [{'id': 'p1', 'name': 'Плов', 'price': 1, 'is_available': true}],
        'PATCH /inventory/products/p1/availability': (o) => fail ? Reply({'detail': 'нельзя'}, status: 403) : {},
      }, prefs: signedIn);
      await _open(tester, const StopListPage());
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(find.text('нельзя'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, true, reason: 'reloaded from the server');
      fail = false;
    });

    testWidgets('the stop-list can be filtered to stopped dishes', (tester) async {
      await setUpApi({
        'GET /inventory/products': (o) => [
              {'id': 'p1', 'name': 'Плов', 'price': 1, 'is_available': true},
              {'id': 'p2', 'name': 'Лагман', 'price': 1, 'is_available': false},
            ],
      }, prefs: signedIn);
      await _open(tester, const StopListPage());
      await tester.tap(find.text('В стопе'));
      await tester.pumpAndSettle();
      expect(find.text('Плов'), findsNothing);
      expect(find.text('Лагман'), findsOneWidget);
    });

    testWidgets('the dishes list searches by name', (tester) async {
      await setUpApi({
        'GET /inventory/products': (o) => [
              {'id': 'p1', 'name': 'Плов', 'price': 35000, 'category_name': 'Горячее'},
              {'id': 'p2', 'name': 'Чай', 'price': 8000},
            ],
      }, prefs: signedIn);
      await _open(tester, const DishesPage());
      expect(find.text('Плов'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'ча');
      await tester.pumpAndSettle();
      expect(find.text('Плов'), findsNothing);
      expect(find.text('Чай'), findsOneWidget);
    });

    testWidgets('a new dish is created as type "dish" with a numeric price', (tester) async {
      final a = await setUpApi({
        'GET /inventory/categories': (o) => [{'id': 'c1', 'name': 'Горячее'}],
        'GET /printers': (o) => [{'id': 'pr1', 'name': 'Кухня'}],
        'POST /inventory/products': (o) => {'id': 'new1', 'name': 'Самса', 'price': 9000},
      }, prefs: signedIn);
      await _open(tester, const DishEditPage());
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Самса');
      await tester.enterText(f.at(1), '9000');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /inventory/products').single.data as Map;
      expect(b['name'], 'Самса');
      expect(b['price'], 9000);
      expect(b['product_type'], 'dish');
      expect(b['is_active'], true);
      expect(find.text('МОДИФИКАТОРЫ', skipOffstage: false), findsOneWidget, reason: 'the modifiers section appears once the dish exists');
    });

    testWidgets('a dish needs a name and a price', (tester) async {
      final a = await setUpApi({'GET /inventory/categories': (o) => [], 'GET /printers': (o) => [], 'POST /inventory/products': (o) => {}}, prefs: signedIn);
      await _open(tester, const DishEditPage());
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Укажите название и цену'), findsOneWidget);
      expect(a.calls('POST /inventory/products'), isEmpty);
    });

    testWidgets('editing a dish patches it and keeps unrelated fields', (tester) async {
      final a = await setUpApi({
        'GET /inventory/categories': (o) => [{'id': 'c1', 'name': 'Горячее'}],
        'GET /printers': (o) => [],
        'GET /inventory/products/p1/modifier-groups': (o) => [],
        'PATCH /inventory/products/p1': (o) => {},
      }, prefs: signedIn);
      await _open(tester, DishEditPage(dish: {'id': 'p1', 'name': 'Плов', 'price': 35000, 'category_id': 'c1', 'unit': 'порц', 'is_active': true}));
      await tester.enterText(find.byType(TextField).at(1), '38000');
      await _reveal(tester, find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /inventory/products/p1').single.data as Map;
      expect(b['price'], 38000);
      expect(b['category_id'], 'c1');
      expect(b['unit'], 'порц');
    });

    testWidgets('a modifier group is saved with its options', (tester) async {
      final a = await setUpApi({'POST /inventory/modifier-groups': (o) => {}}, prefs: signedIn);
      await _open(tester, const ModifierGroupPage(productId: 'p1'));
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Соус');
      await tester.enterText(f.at(3), 'Острый');
      await tester.enterText(f.at(4), '2000');
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /inventory/modifier-groups').single.data as Map;
      expect(b['product_id'], 'p1');
      expect(b['name'], 'Соус');
      expect(b['max_select'], 1);
      final mods = b['modifiers'] as List;
      expect(mods.single['name'], 'Острый');
      expect(mods.single['price_delta'], 2000);
      expect(mods.single.containsKey('id'), false);
    });

    testWidgets('existing modifier options keep their ids on update', (tester) async {
      final a = await setUpApi({'PATCH /inventory/modifier-groups/g1': (o) => {}}, prefs: signedIn);
      await _open(tester, ModifierGroupPage(productId: 'p1', group: {
        'id': 'g1', 'name': 'Соус', 'min_select': 0, 'max_select': 2, 'is_required': true, 'show_in_pos': true,
        'modifiers': [{'id': 'm1', 'name': 'Острый', 'price_delta': 2000, 'is_default': true}],
      }));
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /inventory/modifier-groups/g1').single.data as Map;
      expect((b['modifiers'] as List).single['id'], 'm1');
      expect((b['modifiers'] as List).single['is_default'], true);
      expect(b['is_required'], true);
      expect(b['max_select'], 2);
    });

    testWidgets('a modifier group with an empty name is rejected', (tester) async {
      final a = await setUpApi({'POST /inventory/modifier-groups': (o) => {}}, prefs: signedIn);
      await _open(tester, const ModifierGroupPage(productId: 'p1'));
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Укажите название группы'), findsOneWidget);
      expect(a.calls('POST /inventory/modifier-groups'), isEmpty);
    });
  });

  group('finance', () {
    testWidgets('the hub lists all finance sections', (tester) async {
      await setUpApi({});
      await _open(tester, const FinanceHubPage());
      for (final t in ['Денежные операции', 'Категории приходов', 'Категории расходов', 'Контрагенты', 'История изменений', 'Дебиторы и кредиторы']) {
        expect(find.text(t), findsOneWidget);
      }
    });

    testWidgets('transactions are filtered by direction on the server and summed', (tester) async {
      final a = await setUpApi({
        'GET /finance/transactions': (o) => [
              {'id': 't1', 'direction': 'income', 'amount': 100000, 'comment': 'Выручка', 'date': '2026-09-25T10:00:00'},
              {'id': 't2', 'direction': 'expense', 'amount': 30000, 'comment': 'Мука', 'date': '2026-09-25T11:00:00'},
            ],
      }, prefs: signedIn);
      await _open(tester, const TransactionsPage());
      expect(find.text('+100 000 сум'), findsOneWidget);
      expect(find.text('−30 000 сум'), findsOneWidget);
      await tester.tap(find.text('Расходы'));
      await tester.pumpAndSettle();
      expect(a.calls('GET /finance/transactions').last.queryParameters['direction'], 'expense');
    });

    testWidgets('creating an operation sends an idempotency key and the right direction', (tester) async {
      final a = await setUpApi({
        'GET /finance/transaction-categories': (o) => [{'id': 'c1', 'name': o.queryParameters['kind'] == 'income' ? 'Продажи' : 'Аренда'}],
        'GET /finance/payment-types': (o) => {'items': [{'id': 'pt1', 'name': 'Наличные'}]},
        'POST /finance/transactions': (o) => {'id': 'x'},
      }, prefs: signedIn);
      await _open(tester, const TransactionForm());
      await tester.enterText(find.byType(TextField).at(0), '45000');
      await tester.enterText(find.byType(TextField).at(1), 'Аренда за сентябрь');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final call = a.calls('POST /finance/transactions').single;
      final b = call.data as Map;
      expect(b['direction'], 'expense');
      expect(b['amount'], 45000);
      expect(b['comment'], 'Аренда за сентябрь');
      expect(call.headers['Idempotency-Key'].toString(), startsWith('owner-finance-'));
    });

    testWidgets('switching to income reloads income categories', (tester) async {
      final a = await setUpApi({
        'GET /finance/transaction-categories': (o) => [],
        'GET /finance/payment-types': (o) => {'items': []},
      }, prefs: signedIn);
      await _open(tester, const TransactionForm());
      await tester.tap(find.text('Приход'));
      await tester.pumpAndSettle();
      expect(a.calls('GET /finance/transaction-categories').last.queryParameters['kind'], 'income');
    });

    testWidgets('an amount of zero or a non-number is rejected', (tester) async {
      final a = await setUpApi({
        'GET /finance/transaction-categories': (o) => [],
        'GET /finance/payment-types': (o) => {'items': []},
        'POST /finance/transactions': (o) => {},
      }, prefs: signedIn);
      await _open(tester, const TransactionForm());
      await tester.enterText(find.byType(TextField).at(0), '0');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Введите сумму'), findsOneWidget);
      expect(a.calls('POST /finance/transactions'), isEmpty);
    });

    testWidgets('editing an operation patches it without a direction', (tester) async {
      final a = await setUpApi({
        'GET /finance/transaction-categories': (o) => [],
        'GET /finance/payment-types': (o) => {'items': []},
        'PATCH /finance/transactions/t1': (o) => {},
      }, prefs: signedIn);
      await _open(tester, const TransactionForm(item: {'id': 't1', 'direction': 'income', 'amount': 1000, 'comment': 'x'}));
      await tester.enterText(find.byType(TextField).at(0), '2500');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /finance/transactions/t1').single.data as Map;
      expect(b['amount'], 2500);
      expect(b.containsKey('direction'), false);
    });

    testWidgets('counterparties are created with a type', (tester) async {
      final a = await setUpApi({'GET /finance/counterparties': (o) => {'items': []}, 'POST /finance/counterparties': (o) => {}}, prefs: signedIn);
      await _open(tester, ResourcePage(counterpartiesConfig));
      await tester.tap(find.text('Новый контрагент'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Baraka LLC');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /finance/counterparties').single.data as Map;
      expect(b['full_name'], 'Baraka LLC');
      expect(b['type'], 'client');
    });
  });

  group('warehouse', () {
    testWidgets('the hub links to every journal', (tester) async {
      await setUpApi({});
      await _open(tester, const WarehouseHubPage());
      for (final t in ['Остатки', 'Журнал приходов', 'Перемещения', 'Инвентаризации', 'Списания']) {
        expect(find.text(t), findsOneWidget);
      }
    });

    testWidgets('stock lists ingredients (owners cannot read the stock report)', (tester) async {
      final a = await setUpApi({'GET /inventory/ingredients': (o) => [{'id': 'i1', 'name': 'Мука', 'unit': 'кг', 'current_stock': 12}]}, prefs: signedIn);
      await _open(tester, const StockPage());
      expect(find.text('Мука'), findsOneWidget);
      expect(a.log.where((o) => o.path.contains('storage-balances')), isEmpty);
    });

    testWidgets('a purchase needs a warehouse and at least one item', (tester) async {
      final a = await setUpApi({'POST /warehouse/purchases': (o) => {}}, prefs: signedIn);
      await _open(tester, const PurchaseForm());
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Укажите склад и хотя бы одну позицию'), findsOneWidget);
      expect(a.calls('POST /warehouse/purchases'), isEmpty);
    });

    testWidgets('a purchase is sent with typed quantities and prices', (tester) async {
      final a = await setUpApi({'POST /warehouse/purchases': (o) => {'id': 'p'}}, prefs: signedIn);
      await _open(tester, const PurchaseForm());
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Baraka');
      await tester.enterText(f.at(1), 'Основной');
      await tester.enterText(f.at(2), 'Мука');
      await tester.enterText(f.at(3), '10,5');
      await tester.enterText(f.at(4), '8000');
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /warehouse/purchases').single.data as Map;
      expect(b['supplier'], 'Baraka');
      expect(b['warehouse_name'], 'Основной');
      final item = (b['items'] as List).single as Map;
      expect(item['name'], 'Мука');
      expect(item['quantity'], 10.5, reason: 'a decimal comma is accepted');
      expect(item['cost_price'], 8000);
    });

    testWidgets('a write-off needs a category', (tester) async {
      final a = await setUpApi({'GET /warehouse/write-offs': (o) => [], 'POST /warehouse/write-offs': (o) => {}}, prefs: signedIn);
      await _open(tester, ResourcePage(warehouseJournal('Списания', '/warehouse/write-offs', Icons.delete_sweep_outlined, createLabel: 'Списание', fields: const [Field('category', 'Категория', required: true), Field('items_count', 'Кол-во позиций', type: FieldType.number, defaultValue: 0)])));
      await tester.tap(find.text('Списание'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Заполните: Категория'), findsOneWidget);
      await tester.enterText(find.byType(TextField).at(0), 'Порча');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      expect((a.calls('POST /warehouse/write-offs').single.data as Map)['category'], 'Порча');
    });

    testWidgets('transfers are not creatable from the app yet (joint backend-contract gap)', (tester) async {
      await setUpApi({'GET /warehouse/transfers': (o) => []}, prefs: signedIn);
      await _open(tester, ResourcePage(transfersConfig));
      expect(find.text('Перемещение'), findsNothing);
    });

    testWidgets('purchases: the owner can open the create form from the journal', (tester) async {
      await setUpApi({'GET /warehouse/purchases': (o) => [{'id': 'p1', 'number': 7, 'supplier': 'Baraka', 'total_amount': 90000, 'status': 'ok'}]}, prefs: signedIn);
      await _open(tester, const PurchasesPage());
      expect(find.text('Baraka'), findsOneWidget);
      expect(find.text('90 000'), findsOneWidget);
      expect(find.text('Приход'), findsOneWidget);
    });
  });

  group('settings', () {
    testWidgets('the hub lists every settings section', (tester) async {
      await setUpApi({});
      await _open(tester, const SettingsHubPage());
      for (final t in ['Профиль организации', 'Филиалы', 'Места (залы и столы)', 'Клиенты', 'Способы оплаты', 'Единицы измерения', 'Принтеры', 'Чек клиента', 'Чек кухни', 'Тех. поддержка', 'Политика конфиденциальности']) {
        await tester.ensureVisible(find.text(t));
        expect(find.text(t), findsOneWidget);
      }
    });

    testWidgets('the company profile sends only filled fields with proper types', (tester) async {
      final a = await setUpApi({
        'GET /companies/me': (o) => {'name': 'Cafe', 'phone': '+998', 'vat_rate': 12, 'service_fee': null, 'waiter_service_percent': 10},
        'PATCH /companies/me': (o) => {},
      }, prefs: {...signedIn, 'x': 'y'});
      await _open(tester, const CompanyProfilePage());
      final f = find.byType(TextField);
      await tester.enterText(f.at(0), 'Cafe Marjon');
      await tester.enterText(f.at(5), '5,5');
      await tester.ensureVisible(find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /companies/me').single.data as Map;
      expect(b['name'], 'Cafe Marjon');
      expect(b['service_fee'], 5.5);
      expect(b['vat_rate'], 12);
      expect(b['waiter_service_percent'], 10);
      expect(b.containsKey('address'), false, reason: 'empty fields are not sent (the API forbids nulls on some fields)');
    });

    testWidgets('halls show tables and allow adding a table', (tester) async {
      final a = await setUpApi({
        'GET /halls': (o) => [{'id': 'h1', 'name': 'Зал', 'is_active': true}],
        'GET /halls/h1/tables': (o) => [{'id': 't1', 'number': 1, 'capacity': 4, 'is_active': true}],
        'POST /halls/h1/tables': (o) => {'id': 't2'},
      }, prefs: signedIn);
      await _open(tester, const HallsPage());
      await tester.tap(find.text('Зал'));
      await tester.pumpAndSettle();
      expect(find.text('Стол 1'), findsOneWidget);
      expect(find.text('4 мест'), findsOneWidget);
      await tester.tap(find.text('Стол').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '2');
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('POST /halls/h1/tables').single.data as Map;
      expect(b['number'], 2);
      expect(b['capacity'], 4);
    });

    testWidgets('branches never offer deletion', (tester) async {
      await setUpApi({'GET /companies/me/branches': (o) => [{'id': 'b1', 'name': 'Central', 'login': '90 111-22-33'}]}, prefs: signedIn);
      await _open(tester, ResourcePage(branchesConfig));
      await tester.tap(find.text('Central'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Удалить'), findsNothing);
    });

    testWidgets('an empty receipt template falls back to sensible defaults and saves the block order', (tester) async {
      final a = await setUpApi({
        'GET /settings/receipt-template': (o) => <String, Object?>{},
        'GET /companies/me': (o) => {'name': 'Marjon Cafe', 'phone': '+998770702101'},
        'PATCH /settings/receipt-template': (o) => {},
      }, prefs: signedIn);
      await _open(tester, const ReceiptSettingsPage(kitchen: false));
      expect(find.text('Marjon Cafe'), findsOneWidget);
      await _reveal(tester, find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /settings/receipt-template').single.data as Map;
      expect(b['paperSize'], '80mm');
      expect((b['blocks'] as List).first, 'logo');
      expect((b['enabled'] as Map)['address'], false);
      expect((b['enabled'] as Map)['total'], true);
      expect(b['restaurantName'], 'Marjon Cafe');
    });

    testWidgets('receipt blocks can be toggled and reordered', (tester) async {
      final a = await setUpApi({
        'GET /settings/receipt-template': (o) => <String, Object?>{},
        'GET /companies/me': (o) => <String, Object?>{},
        'PATCH /settings/receipt-template': (o) => {},
      }, prefs: signedIn);
      await _open(tester, const ReceiptSettingsPage(kitchen: false));
      await _reveal(tester, find.text('Логотип'));
      await tester.tap(find.byType(Switch).first);
      await tester.tap(find.byIcon(Icons.arrow_downward).first);
      await tester.pump();
      await _reveal(tester, find.text('Сохранить'));
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();
      final b = a.calls('PATCH /settings/receipt-template').single.data as Map;
      expect((b['enabled'] as Map)['logo'], false);
      expect((b['blocks'] as List).take(2).toList(), ['restaurantName', 'logo']);
    });

    testWidgets('a saved template is applied to the editor', (tester) async {
      await setUpApi({
        'GET /settings/kitchen-receipt-template': (o) => {'paperSize': '58mm', 'autoPrint': true, 'blocks': ['items', 'table'], 'enabled': {'items': true, 'table': false}},
      }, prefs: signedIn);
      await _open(tester, const ReceiptSettingsPage(kitchen: true));
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, true);
      expect(find.text('Позиции'), findsWidgets);
    });

    testWidgets('a support ticket needs a message and confirms on success', (tester) async {
      final a = await setUpApi({'POST /support/tickets': (o) => {'id': 't'}}, prefs: signedIn);
      await _open(tester, const SupportPage());
      await tester.tap(find.text('Отправить'));
      await tester.pump();
      expect(a.calls('POST /support/tickets'), isEmpty);
      await tester.pump(const Duration(seconds: 4));
      await tester.enterText(find.byType(TextField).at(1), 'Не печатает чек');
      await tester.tap(find.text('Отправить'));
      await tester.pumpAndSettle();
      expect((a.calls('POST /support/tickets').single.data as Map)['message'], 'Не печатает чек');
      expect(find.textContaining('Сообщение отправлено'), findsOneWidget);
    });

    testWidgets('the privacy policy renders all sections', (tester) async {
      await setUpApi({});
      await _open(tester, const PrivacyPage());
      expect(find.text('Политика конфиденциальности'), findsOneWidget);
      expect(find.textContaining('support@marjon.tech'), findsWidgets);
    });
  });
}
