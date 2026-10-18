import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import 'resource_page.dart';

Future<Map<String, String>> _options(String path, {String nameKey = 'name', Map<String, dynamic>? query}) async {
  final rows = asJsonList(await Api.i.get(path, query: query));
  return {for (final r in rows) '${r['id']}': '${r[nameKey] ?? r['full_name'] ?? r['id']}'};
}

Widget? _activePill(Json r, {String key = 'is_active'}) {
  final v = r[key] ?? r['status'];
  if (v == false) return Pill('Неактивен', bg: MC.n100, fg: MC.n600);
  return null;
}

String _slugify(String name) {
  const map = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya'};
  final s = name.toLowerCase().split('').map((c) => map[c] ?? c).join().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
  return '${s.isEmpty ? 'cat' : s}-${DateTime.now().millisecondsSinceEpoch % 100000}';
}

final dishesConfig = ResourceConfig(
  title: 'Блюда',
  path: '/inventory/products',
  icon: Icons.restaurant_menu,
  createLabel: 'Новое блюдо',
  emptyText: 'Блюд пока нет',
  itemTitle: (r) => '${r['name']}',
  itemSubtitle: (r) => [if (r['category_name'] != null) '${r['category_name']}', if (r['is_available'] == false) 'в стоп-листе'].join(' · '),
  itemTrailing: (r) => Padding(padding: const EdgeInsets.only(right: 6), child: Text(fmtMoney(toNum(r['price'])), style: MT.money)),
  createExtra: const {'product_type': 'dish'},
  fields: [
    const Field('name', 'Название', required: true),
    const Field('price', 'Цена, сум', type: FieldType.number, required: true),
    const Field('cost_price', 'Себестоимость, сум', type: FieldType.number),
    Field('category_id', 'Категория', type: FieldType.select, loadOptions: () => _options('/inventory/categories')),
    const Field('unit', 'Единица', defaultValue: 'шт'),
    const Field('description', 'Описание', type: FieldType.multiline),
    const Field('sort_order', 'Порядок', type: FieldType.number, defaultValue: 0),
    const Field('is_active', 'Активно', type: FieldType.toggle, defaultValue: true),
  ],
);

final dishCategoriesConfig = ResourceConfig(
  title: 'Категории блюд',
  path: '/inventory/categories',
  icon: Icons.category_outlined,
  createLabel: 'Новая категория',
  emptyText: 'Категорий пока нет',
  itemTitle: (r) => '${r['name']}',
  itemTrailing: (r) => _activePill(r),
  beforeSave: (b, isNew) {
    if (isNew) b['slug'] = _slugify('${b['name']}');
    b.remove('sort_order');
  },
  fields: const [
    Field('name', 'Название', required: true),
  ],
);

// Settings → "Клиенты" is a 4-way tab over the same `/crm/counterparties`
// endpoint (web's SettingsClientsPage): one physical table, `type` tells
// clients/suppliers/staff/other apart. See ClientsPage in
// features/settings/clients_page.dart for the tabbed screen.
const clientTypeLabels = {'client': 'Клиенты', 'supplier': 'Поставщики', 'employee': 'Сотрудники', 'other': 'Другое'};
const _clientTypeCreateLabel = {'client': 'Новый клиент', 'supplier': 'Новый поставщик', 'employee': 'Новый сотрудник', 'other': 'Новая запись'};
const _clientTypeEmpty = {'client': 'Клиентов пока нет', 'supplier': 'Поставщиков пока нет', 'employee': 'Сотрудников пока нет', 'other': 'Записей пока нет'};

ResourceConfig clientTypeConfig(String type) => ResourceConfig(
      title: clientTypeLabels[type] ?? 'Клиенты',
      path: '/crm/counterparties',
      icon: Icons.people_outline,
      createLabel: _clientTypeCreateLabel[type] ?? 'Новая запись',
      emptyText: _clientTypeEmpty[type] ?? 'Записей пока нет',
      itemTitle: (r) => '${r['full_name'] ?? r['name']}',
      itemSubtitle: (r) => r['phone'] != null ? '${r['phone']}' : null,
      createExtra: {'type': type},
      fields: const [
        Field('full_name', 'Имя / название', required: true),
        Field('phone', 'Телефон'),
      ],
    );

final paymentMethodsConfig = ResourceConfig(
  title: 'Способы оплаты',
  path: '/finance/payment-types',
  query: const {'size': 200},
  icon: Icons.credit_card,
  createLabel: 'Новый способ',
  emptyText: 'Способов оплаты пока нет',
  itemTitle: (r) => '${r['name']}',
  itemTrailing: (r) => _activePill(r),
  fields: const [
    Field('name', 'Название', required: true),
    Field('sort', 'Порядок', type: FieldType.number, defaultValue: 0),
    Field('status', 'Активен', type: FieldType.toggle, defaultValue: true),
  ],
);

// Units are a global picklist shared by every company: the API allows writes for HQ admins only.
final unitsConfig = ResourceConfig(
  title: 'Единицы измерения',
  path: '/units',
  icon: Icons.straighten,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  createLabel: 'Новая единица',
  emptyText: 'Единиц пока нет',
  itemTitle: (r) => '${r['name']}${r['short_name'] != null ? ' (${r['short_name']})' : ''}',
  itemTrailing: (r) => _activePill(r),
  fields: const [
    Field('name', 'Название', required: true),
    Field('short_name', 'Сокращение'),
    Field('sort', 'Порядок', type: FieldType.number, defaultValue: 0),
    Field('status', 'Активна', type: FieldType.toggle, defaultValue: true),
  ],
);

const printerTypes = {'receipt': 'Чековый', 'kitchen': 'Кухня', 'bar': 'Бар', 'label': 'Этикетки'};

final printersConfig = ResourceConfig(
  title: 'Принтеры',
  path: '/printers',
  icon: Icons.print_outlined,
  createLabel: 'Новый принтер',
  emptyText: 'Принтеров пока нет',
  itemTitle: (r) => '${r['name']}',
  itemSubtitle: (r) => [printerTypes['${r['printer_type']}'] ?? '${r['printer_type']}', if (r['ip_address'] != null) '${r['ip_address']}:${r['port']}'].join(' · '),
  itemTrailing: (r) => _activePill(r),
  fields: const [
    Field('name', 'Название', required: true),
    Field('printer_type', 'Тип', type: FieldType.select, options: printerTypes, required: true, defaultValue: 'receipt'),
    Field('ip_address', 'IP-адрес', hint: '192.168.1.50'),
    Field('port', 'Порт', type: FieldType.number, defaultValue: 9100),
    Field('paper_width', 'Ширина бумаги, мм', type: FieldType.number, defaultValue: 80),
    Field('zone', 'Зона'),
    Field('is_active', 'Активен', type: FieldType.toggle, defaultValue: true),
  ],
);

ResourceConfig transactionCategoriesConfig(String kind) => ResourceConfig(
      title: kind == 'income' ? 'Категории приходов' : 'Категории расходов',
      path: '/finance/transaction-categories',
      query: {'kind': kind},
      icon: kind == 'income' ? Icons.south_west : Icons.north_east,
      createLabel: 'Новая категория',
      emptyText: 'Категорий пока нет',
      itemTitle: (r) => '${r['name']}',
      itemTrailing: (r) => _activePill(r, key: 'status'),
      createExtra: {'kind': kind},
      fields: const [
        Field('name', 'Название', required: true),
        Field('status', 'Активна', type: FieldType.toggle, defaultValue: true),
      ],
    );

ResourceConfig warehouseJournal(String title, String path, IconData icon, {List<Field> fields = const [], String createLabel = 'Добавить'}) => ResourceConfig(
      title: title,
      path: path,
      icon: icon,
      canCreate: fields.isNotEmpty,
      canEdit: false,
      canDelete: false,
      createLabel: createLabel,
      emptyText: 'Записей пока нет',
      itemTitle: (r) => [if (r['number'] != null) '№${r['number']}', '${r['supplier'] ?? r['category'] ?? r['warehouse_name'] ?? r['check_type'] ?? '—'}'].join(' · '),
      itemSubtitle: (r) => [if (r['status'] != null) '${r['status']}', if (r['created_by_name'] != null) '${r['created_by_name']}'].join(' · '),
      itemTrailing: (r) => r['total_amount'] == null ? null : Text(fmtMoney(toNum(r['total_amount'])), style: MT.money),
      fields: fields,
    );

final counterpartiesConfig = ResourceConfig(
  title: 'Контрагенты',
  path: '/finance/counterparties',
  query: const {'size': 200},
  icon: Icons.people_alt_outlined,
  createLabel: 'Новый контрагент',
  canDelete: false,
  emptyText: 'Контрагентов пока нет',
  itemTitle: (r) => '${r['full_name']}',
  itemSubtitle: (r) => [if (r['phone'] != null) '${r['phone']}', if (r['type'] != null) '${r['type']}'].join(' · '),
  itemTrailing: (r) => Text(fmtMoney(toNum(r['balance'])), style: MT.money),
  fields: const [
    Field('full_name', 'Имя / название', required: true),
    Field('phone', 'Телефон'),
    Field('type', 'Тип', type: FieldType.select, options: {'client': 'Клиент', 'supplier': 'Поставщик'}, defaultValue: 'client'),
  ],
);

final financeHistoryConfig = ResourceConfig(
  title: 'История изменений',
  path: '/finance/finance-history',
  query: const {'size': 100},
  icon: Icons.history,
  canCreate: false,
  canEdit: false,
  emptyText: 'Изменений пока нет',
  itemTitle: (r) => '${r['status'] ?? r['action'] ?? 'Изменение'} · ${fmtMoney(toNum(r['amount'] ?? r['new_amount']))}',
  itemSubtitle: (r) => '${r['comment'] ?? r['created_at'] ?? ''}',
  fields: const [],
);

// Warehouse writes need 'inventory:stock:write', which the owner role does not have (warehouse / manager do).
final transfersConfig = ResourceConfig(
  title: 'Перемещения',
  path: '/warehouse/transfers',
  icon: Icons.swap_horiz,
  canCreate: false,
  createLabel: 'Перемещение',
  canEdit: false,
  canDelete: false,
  emptyText: 'Перемещений пока нет',
  itemTitle: (r) => '${r['from_warehouse_name']} → ${r['to_warehouse_name']}',
  itemSubtitle: (r) => [if (r['items_count'] != null) '${r['items_count']} поз.', if (r['status'] != null) '${r['status']}'].join(' · '),
  fields: const [
    Field('from_warehouse_name', 'Откуда', required: true),
    Field('to_warehouse_name', 'Куда', required: true),
    Field('items_count', 'Кол-во позиций', type: FieldType.number, defaultValue: 0),
  ],
);
