import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/app.dart';
import 'package:marjon_owner/src/features/common/resource_page.dart';
import 'package:marjon_owner/src/features/common/resources.dart';
import 'package:marjon_owner/src/features/finance/finance_pages.dart';
import 'package:marjon_owner/src/features/menu/dish_pages.dart';
import 'package:marjon_owner/src/features/menu/menu_pages.dart';
import 'package:marjon_owner/src/features/orders/orders_page.dart';
import 'package:marjon_owner/src/features/reports/reports_pages.dart';
import 'package:marjon_owner/src/features/settings/clients_page.dart';
import 'package:marjon_owner/src/features/settings/receipt_page.dart';
import 'package:marjon_owner/src/features/settings/settings_pages.dart';
import 'package:marjon_owner/src/features/settings/support_page.dart';
import 'package:marjon_owner/src/features/staff/staff_pages.dart';
import 'package:marjon_owner/src/features/warehouse/warehouse_pages.dart';
import 'package:marjon_owner/src/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

// Every screen must lay out without overflow on small, normal and large phones,
// with long real-world names. Overflow = a Flutter exception = a failing test.

const _long = 'Очень длинное название позиции для проверки переноса строк';

Map<String, Object?> _order(String id, String status) => {
      'id': id,
      'order_number': '12345',
      'status': status,
      'order_type': 'dine_in',
      'table_number': '12',
      'total_amount': 12345678,
      'created_at': '2026-09-25T11:48:00',
      'waiter_name': 'Алишер Абдукадиров',
      'note': _long,
      'items': [
        {'id': 'i1', 'name': _long, 'quantity': 12, 'total': 12345678},
      ],
      'subtotal': 12345678,
      'discount_amount': 1000,
      'service_fee': 500,
      'tax_amount': 100,
    };

Map<String, Handler> _routes() => {
      'GET /auth/me': (o) => {'id': 'u1', 'name': 'Алишер Абдукадиров Очень Длинное Имя'},
      'GET /analytics/dashboard': (o) => {'today_revenue': 123456789, 'today_orders': 1234, 'avg_check': 98765432, 'active_orders': 12},
      'GET /analytics/sales': (o) => [
            for (var i = 0; i < 7; i++) {'date': '2026-09-${19 + i}', 'orders_count': 3, 'revenue': 1000000 * (i + 1), 'avg_check': 1}
          ],
      'GET /analytics/products/top': (o) => [
            {'product_id': 'p1', 'name': _long, 'quantity_sold': 1234, 'revenue': 123456789},
          ],
      'GET /finance/transactions': (o) => [
            {'id': 't1', 'direction': 'income', 'amount': 123456789, 'comment': _long, 'date': '2026-09-25T10:00:00'},
            {'id': 't2', 'direction': 'expense', 'amount': 1000, 'category_name': _long, 'date': '2026-09-25T10:00:00'},
          ],
      'GET /billing/balance': (o) => {'balance': 123456789, 'days_left': 12},
      'GET /pos/orders': (o) => [_order('o1', 'new'), _order('o2', 'cancelled')],
      'GET /pos/orders/o1': (o) => _order('o1', 'new'),
      'GET /auth/users': (o) => [
            {'id': 'u1', 'name': _long, 'phone': '+998901112233', 'role_slug': 'cashier', 'is_active': true},
            {'id': 'u2', 'name': 'Владелец', 'role_slug': 'owner', 'is_active': false},
          ],
      'GET /hr/login-history': (o) => [{'date': '2026-09-25', 'employee': _long, 'role': 'cashier', 'device': 'Samsung Galaxy S24 Ultra', 'login': '09:00', 'logout': '18:00', 'status': 'ok'}],
      'GET /inventory/products': (o) => [
            {'id': 'p1', 'name': _long, 'price': 123456789, 'category_name': _long, 'is_available': false, 'is_active': true, 'unit': 'шт'},
          ],
      'GET /inventory/categories': (o) => [{'id': 'c1', 'name': _long}],
      'GET /inventory/products/p1/modifier-groups': (o) => [
            {'id': 'g1', 'name': _long, 'is_required': true, 'modifiers': [{'id': 'm1', 'name': _long, 'price_delta': 1000}]},
          ],
      'GET /inventory/ingredients': (o) => [{'id': 'i1', 'name': _long, 'unit': 'кг', 'current_stock': 12}],
      'GET /printers': (o) => [{'id': 'pr1', 'name': _long, 'printer_type': 'receipt', 'ip_address': '192.168.100.200', 'port': 9100}],
      'GET /units': (o) => [{'id': 'u1', 'name': _long, 'short_name': 'кг', 'status': true}],
      'GET /crm/counterparties': (o) => [{'id': 'c1', 'full_name': _long, 'phone': '+998901112233', 'type': 'client'}],
      'GET /finance/payment-types': (o) => {'items': [{'id': 'pt1', 'name': _long, 'status': false}]},
      'GET /finance/counterparties': (o) => {'items': [{'id': 'c1', 'full_name': _long, 'balance': 123456789, 'type': 'supplier'}]},
      'GET /finance/transaction-categories': (o) => [{'id': 'tc1', 'name': _long, 'status': true}],
      'GET /companies/me': (o) => {'name': _long, 'phone': '+998901112233', 'address': _long, 'vat_rate': 12, 'service_fee': 10, 'waiter_service_percent': 10},
      'GET /companies/me/branches': (o) => [{'id': 'b1', 'name': _long, 'address': _long, 'login': '90 111-22-33'}],
      'GET /halls': (o) => [{'id': 'h1', 'name': _long, 'description': _long, 'percent': 10, 'is_active': false}],
      'GET /halls/h1/tables': (o) => [{'id': 't1', 'number': 12, 'capacity': 4, 'is_active': false}],
      'GET /warehouse/purchases': (o) => [{'id': 'p1', 'number': 1, 'supplier': _long, 'total_amount': 123456789, 'status': 'ok', 'created_by_name': _long}],
      'GET /warehouse/transfers': (o) => [{'id': 't1', 'from_warehouse_name': _long, 'to_warehouse_name': _long, 'items_count': 3}],
      'GET /warehouse/inventory-checks': (o) => [{'id': 'c1', 'warehouse_name': _long, 'check_type': _long, 'status': 'ok'}],
      'GET /warehouse/write-offs': (o) => [{'id': 'w1', 'category': _long, 'items_count': 3}],
      'GET /reports/orders': (o) => [
            {'order_number': '12345', 'created_at': '2026-09-25T11:48:00', 'status': 'completed', 'table_number': '12', 'waiter_name': _long, 'total_amount': 123456789, 'payment_method': 'cash'},
          ],
      'GET /reports/waiters': (o) => [{'waiter_name': _long, 'orders_count': 1234, 'orders_total': 123456789, 'service_fee': 12345678}],
      'GET /reports/dishes': (o) => [{'name': _long, 'quantity': 1234, 'total': 123456789, 'category': _long}],
      'GET /reports/tables': (o) => [{'table_number': '12', 'hall_name': _long, 'orders_count': 12, 'total': 123456789}],
      'GET /reports/cancelled': (o) => [{'dish_name': _long, 'order_number': '12345', 'author': _long, 'reason': _long}],
      'GET /reports/debt-credit': (o) => [{'counterparty_name': _long, 'debt': 123456789, 'credit': 0}],
      'GET /analytics/z-report': (o) => {'gross_sales': 123456789, 'net_sales': 123456789, 'orders_count': 1234, 'payment_methods': [{'method': _long, 'count': 12, 'amount': 123456789}]},
      'GET /settings/receipt-template': (o) => <String, Object?>{},
      'GET /settings/kitchen-receipt-template': (o) => <String, Object?>{},
      'GET /reports/orders/filters': (o) => {
            'waiters': [for (var i = 0; i < 6; i++) {'value': 'w$i', 'label': _long}],
            'cashiers': [],
            'products': [],
          },
    };

const _sizes = [(320.0, 568.0), (360.0, 800.0), (412.0, 915.0)];

Map<String, Widget Function()> pagesUnderTest() => <String, Widget Function()>{
    'orders': () => const OrdersPage(),
    'order detail': () => OrderDetailPage(order: _order('o1', 'new')),
    'reports hub': () => const ReportsHubPage(),
    'z-report': () => const ZReportPage(),
    'report orders': () => const ReportPage(kind: 'orders'),
    'report waiters': () => const ReportPage(kind: 'waiters'),
    'report dishes': () => const ReportPage(kind: 'dishes'),
    'report tables': () => const ReportPage(kind: 'tables'),
    'report cancelled': () => const ReportPage(kind: 'cancelled'),
    'report debt': () => const ReportPage(kind: 'debt'),
    'menu hub': () => const MenuHubPage(),
    'dishes': () => const DishesPage(),
    'dish editor': () => DishEditPage(dish: {'id': 'p1', 'name': _long, 'price': 123456789, 'category_id': 'c1', 'unit': 'шт', 'is_active': true}),
    'modifier group': () => ModifierGroupPage(productId: 'p1', group: {
          'id': 'g1', 'name': _long, 'min_select': 0, 'max_select': 3, 'is_required': true, 'show_in_pos': true,
          'modifiers': [{'id': 'm1', 'name': _long, 'price_delta': 123456, 'is_default': true}],
        }),
    'stop-list': () => const StopListPage(),
    'categories': () => ResourcePage(dishCategoriesConfig),
    'staff': () => const StaffPage(),
    'staff form': () => StaffForm(user: {'id': 'u1', 'name': _long, 'phone': '+998901112233', 'role_slug': 'cashier', 'is_active': true}),
    'login history': () => const StaffActivityPage(type: 'login-history'),
    'warehouse hub': () => const WarehouseHubPage(),
    'stock': () => const StockPage(),
    'purchases': () => const PurchasesPage(),
    'purchase form': () => const PurchaseForm(),
    'transfers': () => ResourcePage(transfersConfig),
    'finance hub': () => const FinanceHubPage(),
    'transactions': () => const TransactionsPage(),
    'transaction form': () => const TransactionForm(item: {'id': 't1', 'direction': 'income', 'amount': 123456789, 'comment': _long}),
    'counterparties': () => ResourcePage(counterpartiesConfig),
    'settings hub': () => const SettingsHubPage(),
    'company profile': () => const CompanyProfilePage(),
    'branches': () => ResourcePage(branchesConfig),
    'halls': () => const HallsPage(),
    'hall detail': () => const HallDetailPage(hall: {'id': 'h1', 'name': _long}),
    'clients': () => const ClientsPage(),
    'payment methods': () => ResourcePage(paymentMethodsConfig),
    'units': () => ResourcePage(unitsConfig),
    'printers': () => ResourcePage(printersConfig),
    'receipt': () => const ReceiptSettingsPage(kitchen: false),
    'kitchen receipt': () => const ReceiptSettingsPage(kitchen: true),
    'support': () => const SupportPage(),
};

Map<String, Handler> routesForSweep() => _routes();

void main() {
  final pages = pagesUnderTest();
  for (final (w, h) in _sizes) {
    for (final e in pages.entries) {
      testWidgets('${e.key} lays out without overflow — ${w.toInt()}x${h.toInt()}', (tester) async {
        useScreen(tester, w, h);
        await setUpApi(_routes(), prefs: signedIn);
        await tester.pumpWidget(host(e.value()));
        await tester.pumpAndSettle();
      });
    }

    testWidgets('the app shell (all tabs) lays out without overflow — ${w.toInt()}x${h.toInt()}', (tester) async {
      useScreen(tester, w, h);
      await setUpApi(_routes(), prefs: signedIn);
      final s = Session();
      await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const OwnerApp()));
      s.init();
      await tester.pumpAndSettle();
      for (final tab in ['Заказы', 'Отчёты', 'Меню', 'Ещё', 'Дашборд']) {
        await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(tab)));
        await tester.pumpAndSettle();
      }
    });

    testWidgets('the login page lays out without overflow — ${w.toInt()}x${h.toInt()}', (tester) async {
      useScreen(tester, w, h);
      await setUpApi({});
      final s = Session();
      await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const OwnerApp()));
      s.init();
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '+998901112233');
      await tester.pump();
    });
  }
}
