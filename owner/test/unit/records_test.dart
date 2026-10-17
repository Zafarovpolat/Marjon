import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/ui/common.dart';
import 'package:marjon_owner/src/ui/kit.dart';
import 'package:marjon_owner/src/ui/records.dart';

void main() {
  group('cellText', () {
    test('empty values become a dash', () {
      expect(cellText('name', null), '—');
      expect(cellText('name', ''), '—');
    });

    test('money-like columns are grouped', () {
      expect(cellText('total', 78400), '78 400');
      expect(cellText('revenue', '1250000.5'), '1 250 001');
      expect(cellText('price', 'abc'), 'abc');
    });

    test('booleans are Да / Нет', () {
      expect(cellText('is_active', true), 'Да');
      expect(cellText('is_active', false), 'Нет');
    });

    test('known status values are translated', () {
      expect(cellText('status', 'cancelled'), 'Отменён');
      expect(cellText('order_type', 'dine_in'), 'В зале');
      expect(cellText('payment_method', 'cash'), 'Наличные');
      expect(cellText('action', 'check_in'), 'Приход');
      expect(cellText('status', 'weird'), 'weird');
      expect(cellText('name', 'cancelled'), 'cancelled', reason: 'only status-like columns are translated');
    });

    test('ISO timestamps are shortened', () {
      expect(cellText('created_at', '2026-09-25T11:48:00'), '25.09 11:48');
      expect(cellText('note', '2026-09-25T11:48:00'), '2026-09-25T11:48:00');
    });

    test('nested values are hidden', () {
      expect(cellText('items', [1, 2]), '');
      expect(cellText('meta', {'a': 1}), '');
    });
  });

  group('columns', () {
    test('labelOf uses Russian captions and humanises unknown keys', () {
      expect(labelOf('waiter_name'), 'Официант');
      expect(labelOf('some_new_field'), 'some new field');
    });

    test('visibleKeys drops ids, tenant columns, coverage flags and nested data', () {
      final row = {
        'id': 'x', 'company_id': 'c', 'product_id': 'p', 'name': 'Плов', 'total': 5, 'cost_coverage_complete': false,
        'items': [], 'meta': {}, 'note': null, 'branch_name': 'B', 'deleted_at': null,
      };
      expect(visibleKeys(row), ['name', 'total']);
    });

    test('visibleKeys respects the limit', () {
      final row = {for (var i = 0; i < 20; i++) 'k$i': i};
      expect(visibleKeys(row, max: 4).length, 4);
    });
  });

  group('formatting', () {
    test('dates', () {
      expect(fmtDate(DateTime(2026, 9, 5)), '05.09.2026');
      expect(isoDate(DateTime(2026, 9, 5)), '2026-09-05');
      expect(fmtDateTime('garbage'), '');
      expect(fmtTime(null), '');
    });

    test('money and phone helpers from the kit', () {
      expect(fmtNum(1500000), '1 500 000');
      expect(fmtMoney(35000), '35 000 сум');
      expect(toNum('12'), 12);
      expect(toNum(null), 0);
      expect(formatPhone('901112233'), '+998 90 111-22-33');
      expect(initials('Иван Петров'), 'ИП');
    });
  });
}
