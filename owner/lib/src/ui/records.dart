import 'package:flutter/material.dart';

import '../net/api.dart';
import '../theme/tokens.dart';
import 'common.dart';
import 'kit.dart';

/// Russian captions for column keys returned by report / journal endpoints.
const columnLabels = <String, String>{
  'name': 'Название', 'title': 'Название', 'product': 'Блюдо', 'product_name': 'Блюдо', 'dish_name': 'Блюдо', 'staff': 'Сотрудник',
  'cashier': 'Кассир', 'cashier_name': 'Кассир', 'waiter': 'Официант', 'waiter_name': 'Официант', 'employee': 'Сотрудник', 'employee_name': 'Сотрудник',
  'count': 'Кол-во', 'qty': 'Кол-во', 'quantity': 'Кол-во', 'dishes_count': 'Кол-во', 'orders': 'Заказы', 'orders_count': 'Заказы',
  'total': 'Сумма', 'amount': 'Сумма', 'sum': 'Сумма', 'orders_total': 'Сумма заказов', 'total_amount': 'Сумма', 'revenue': 'Выручка',
  'date': 'Дата', 'created_at': 'Создан', 'timestamp': 'Время', 'service_fee': 'Обслуживание', 'waiter_share': 'Доля официанта',
  'price': 'Цена', 'unit': 'Ед.', 'profit': 'Прибыль', 'cost': 'Себестоимость', 'order_number': '№ заказа', 'number': '№',
  'status': 'Статус', 'table_number': 'Стол', 'table': 'Стол', 'hall': 'Зал', 'hall_name': 'Зал', 'items_count': 'Позиций',
  'discount_amount': 'Скидка', 'payment_method': 'Оплата', 'order_type': 'Тип', 'avg_check': 'Средний чек',
  'category': 'Категория', 'category_name': 'Категория', 'supplier': 'Поставщик', 'warehouse_name': 'Склад', 'check_type': 'Тип',
  'created_by_name': 'Автор', 'note': 'Комментарий', 'comment': 'Комментарий', 'reason': 'Причина', 'author': 'Автор',
  'role': 'Роль', 'device': 'Устройство', 'login': 'Вход', 'logout': 'Выход', 'action': 'Действие', 'method': 'Способ',
  'phone': 'Телефон', 'balance': 'Баланс', 'debt': 'Долг', 'credit': 'Кредит', 'counterparty': 'Контрагент', 'counterparty_name': 'Контрагент',
  'min_stock': 'Мин. остаток', 'stock': 'Остаток', 'current_stock': 'Остаток', 'reorder_level': 'Мин. остаток', 'cost_price': 'Цена закупки',
  'from_warehouse': 'Откуда', 'to_warehouse': 'Куда', 'items': 'Позиции',
};

final _money = RegExp(r'total|amount|revenue|sum|price|fee|share|profit|cost|balance|debt|credit|discount', caseSensitive: false);
final _hiddenKey = RegExp(r'_id$|^id$|coverage|^company|^branch|^organization|^scope|^deleted|^updated_at$', caseSensitive: false);

String labelOf(String k) => columnLabels[k] ?? k.replaceAll('_', ' ');

const _valueNames = {
  'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится', 'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён', 'dine_in': 'В зале', 'takeaway': 'С собой', 'delivery': 'Доставка', 'cash': 'Наличные', 'card': 'Карта',
  'check_in': 'Приход', 'check_out': 'Уход', 'approved': 'Подтверждено', 'pending': 'Ожидает',
};
final _translatedKey = RegExp(r'^(status|order_type|payment_method|action|method|order_status)$');

String cellText(String k, dynamic v) {
  if (v == null || v == '') return '—';
  if (v is String && _translatedKey.hasMatch(k) && _valueNames.containsKey(v)) return _valueNames[v]!;
  if (v is bool) return v ? 'Да' : 'Нет';
  if (_money.hasMatch(k) && num.tryParse('$v') != null) return fmtNum(num.parse('$v'));
  if (RegExp(r'(_at$|^date$|^timestamp$)').hasMatch(k) && v is String && RegExp(r'^\d{4}-\d{2}-\d{2}T').hasMatch(v)) return fmtDateTime(v);
  if (v is Map || v is List) return '';
  return '$v';
}

List<String> visibleKeys(Json row, {int max = 9}) => row.keys.where((k) => !_hiddenKey.hasMatch(k) && row[k] is! Map && row[k] is! List && row[k] != null).take(max).toList();

/// Renders rows as label/value cards. [titleKey] (if given) becomes the card header.
class RecordCards extends StatelessWidget {
  const RecordCards(this.rows, {super.key, this.titleKey, this.keys, this.onTap, this.footer});
  final List<Json> rows;
  final String? titleKey;
  final List<String>? keys;
  final void Function(Json)? onTap;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const EmptyState('Нет данных за выбранный период', icon: Icons.inbox_outlined);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      itemCount: rows.length + (footer == null ? 0 : 1),
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        if (i == rows.length) return footer!;
        final r = rows[i];
        final ks = (keys ?? visibleKeys(r)).where((k) => k != titleKey).toList();
        return Card2(
          onTap: onTap == null ? null : () => onTap!(r),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (titleKey != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(cellText(titleKey!, r[titleKey]), style: MT.body.copyWith(fontWeight: FontWeight.w700))),
            for (final k in ks) KV(labelOf(k), cellText(k, r[k]), bold: _money.hasMatch(k)),
          ]),
        );
      },
    );
  }
}
