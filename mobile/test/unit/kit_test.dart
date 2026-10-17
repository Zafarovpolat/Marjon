import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/core/perm.dart';
import 'package:marjon_mobile/src/features/order/cart.dart';
import 'package:marjon_mobile/src/ui/kit.dart';

import '../helpers.dart';

void main() {
  setUp(() => setUpApi({}));

  group('money and numbers', () {
    test('fmtNum groups thousands and rounds', () {
      expect(fmtNum(78400), '78 400');
      expect(fmtNum(1234567), '1 234 567');
      expect(fmtNum(999.6), '1 000');
      expect(fmtNum(null), '0');
    });

    test('fmtMoney appends the currency', () => expect(fmtMoney(35000), '35 000 сум'));

    test('toNum parses numbers, strings and junk', () {
      expect(toNum(5), 5);
      expect(toNum('12.5'), 12.5);
      expect(toNum(null), 0);
      expect(toNum('abc'), 0);
    });

    test('formatQty trims trailing zeros', () {
      expect(formatQty(2), '2');
      expect(formatQty('2.000'), '2');
      expect(formatQty(1.5), '1.5');
      expect(formatQty(0.333333), '0.33');
      expect(formatQty(null), '');
      expect(formatQty('x'), 'x');
    });
  });

  group('phone helpers', () {
    test('extractPhoneDigits strips +998 and non digits', () {
      expect(extractPhoneDigits('+998 90 111-22-33'), '901112233');
      expect(extractPhoneDigits('901112233'), '901112233');
      expect(extractPhoneDigits('90111223344455'), '901112233');
    });

    test('formatPhone builds the mask progressively', () {
      expect(formatPhone(''), '+998');
      expect(formatPhone('9'), '+998 9');
      expect(formatPhone('90'), '+998 90');
      expect(formatPhone('90111'), '+998 90 111');
      expect(formatPhone('9011122'), '+998 90 111-22');
      expect(formatPhone('901112233'), '+998 90 111-22-33');
    });

    test('fullPhone and isPhoneComplete', () {
      expect(fullPhone('90 111-22-33'), '+998901112233');
      expect(fullPhone(''), '');
      expect(isPhoneComplete('901112233'), true);
      expect(isPhoneComplete('90111'), false);
    });
  });

  group('avatars', () {
    test('initials', () {
      expect(initials('Иван Петров'), 'ИП');
      expect(initials('cashier'), 'C');
      expect(initials('  '), '?');
      expect(initials(null), '?');
    });

    test('avatarColor is stable per name', () {
      expect(avatarColor('Иван'), avatarColor('Иван'));
    });
  });

  group('Perm', () {
    final cashier = {'role_slugs': ['cashier']};
    final waiter = {'role_slugs': ['waiter']};

    test('cashier defaults grant strict permissions when the server sends none', () {
      expect(Perm.must(cashier, 'can_view_finance'), true);
      expect(Perm.must(cashier, 'can_manage_staff'), false);
    });

    test('non-cashier roles have no strict defaults', () {
      expect(Perm.must(waiter, 'can_view_finance'), false);
      expect(Perm.must(null, 'can_view_finance'), false);
    });

    test('explicit permissions override defaults', () {
      final u = {'role_slugs': ['cashier'], 'permissions': {'can_view_finance': false, 'can_manage_staff': true}};
      expect(Perm.must(u, 'can_view_finance'), false);
      expect(Perm.must(u, 'can_manage_staff'), true);
      expect(Perm.can(u, 'can_view_finance'), false);
    });

    test('can() is permissive unless explicitly denied', () {
      expect(Perm.can(waiter, 'anything'), true);
      expect(Perm.can({'permissions': {'x': false}}, 'x'), false);
      expect(Perm.can({'permissions': {'x': false}}, 'y'), true);
    });

    test('role_slug string is honoured', () => expect(Perm.must({'role_slug': 'Cashier'}, 'can_close_bill'), true));
  });

  group('Cart', () {
    Map<String, dynamic> dish(String id, num price, {bool available = true}) => {'id': id, 'name': 'Dish $id', 'price': price, 'is_available': available};

    test('adds lines and computes totals', () {
      final c = Cart()..add(dish('a', 10000))..add(dish('b', 5000));
      expect(c.lines.length, 2);
      expect(c.subtotal, 15000);
      expect(c.itemCount, 2);
      expect(c.isEmpty, false);
    });

    test('stopped dishes are not added', () {
      final c = Cart()..add(dish('a', 100, available: false))..add({'id': 'b', 'price': 1, 'in_stop_list': true});
      expect(c.isEmpty, true);
    });

    test('changeQty removes a line at zero', () {
      final c = Cart()..add(dish('a', 100));
      final id = c.lines.first.lineId;
      c.changeQty(id, 2);
      expect(c.lines.first.qty, 3);
      expect(c.subtotal, 300);
      c.changeQty(id, -3);
      expect(c.isEmpty, true);
    });

    test('toItemJson honours takeaway and empty note', () {
      final c = Cart()..add(dish('a', 100));
      final j = c.lines.first.toItemJson();
      expect(j['product_id'], 'a');
      expect(j['note'], isNull);
      expect(j['takeaway'], false);
      expect(c.lines.first.toItemJson(forceTakeaway: true)['takeaway'], true);
    });

    test('tapping the same dish again bumps its line instead of duplicating it', () {
      final c = Cart()..add(dish('a', 1000))..add(dish('a', 1000));
      expect(c.lines.length, 1);
      expect(c.lines.first.qty, 2);
      expect(c.qtyOf('a'), 2);
    });

    test('a different product still gets its own line', () {
      final c = Cart()..add(dish('a', 1))..add(dish('b', 1));
      expect(c.lines.length, 2);
      expect(c.lines[0].lineId == c.lines[1].lineId, false);
    });

    test('a customized (DishSheet-edited) line is never merged into by a plain tap', () {
      final c = Cart()..add(dish('a', 1000));
      c.lines.first.note = 'Без лука';
      c.add(dish('a', 1000));
      expect(c.lines.length, 2);
      expect(c.qtyOf('a'), 1, reason: 'the customized line does not count toward the grid badge');
    });

    test('decrement steps down the plain line and removes it at zero', () {
      final c = Cart()..add(dish('a', 1000))..add(dish('a', 1000));
      expect(c.qtyOf('a'), 2);
      c.decrement('a');
      expect(c.qtyOf('a'), 1);
      c.decrement('a');
      expect(c.qtyOf('a'), 0);
      expect(c.isEmpty, true);
    });

    test('isStopped', () {
      expect(isStopped({'is_available': false}), true);
      expect(isStopped({'in_stop_list': true}), true);
      expect(isStopped({'is_available': true}), false);
    });

    test('remove and clear', () {
      final c = Cart()..add(dish('a', 1))..add(dish('b', 1));
      c.remove(c.lines.first.lineId);
      expect(c.lines.length, 1);
      c.clear();
      expect(c.isEmpty, true);
    });
  });
}
