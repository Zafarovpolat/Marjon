import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../net/api.dart';
import '../../session.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../common/resource_page.dart';
import '../common/resources.dart';
import 'clients_page.dart';
import 'privacy_page.dart';
import 'receipt_page.dart';
import 'support_page.dart';

final branchesConfig = ResourceConfig(
  title: 'Филиалы',
  path: '/companies/me/branches',
  icon: Icons.storefront_outlined,
  createLabel: 'Новый филиал',
  canDelete: false,
  emptyText: 'Филиалов пока нет',
  itemTitle: (r) => '${r['name']}',
  itemSubtitle: (r) => [if (r['address'] != null) '${r['address']}', if (r['login'] != null) 'логин: ${r['login']}'].join(' · '),
  fields: const [
    Field('name', 'Название', required: true),
    Field('address', 'Адрес'),
    Field('phone', 'Телефон'),
    Field('login', 'Логин для входа на кассе', hint: '90 111-22-33'),
    Field('password', 'Пароль кассы', hint: 'Оставьте пустым, чтобы не менять'),
  ],
);

class SettingsHubPage extends StatelessWidget {
  const SettingsHubPage({super.key});
  @override
  Widget build(BuildContext context) {
    Widget row(IconData i, String l, Widget Function() page) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Card2(onTap: () => push(context, page()), child: Row(children: [Icon(i, color: MC.teal600), const SizedBox(width: 14), Expanded(child: Text(l, style: MT.body.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right, color: MC.n300)])),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        row(Icons.business_outlined, 'Профиль организации', () => const CompanyProfilePage()),
        row(Icons.storefront_outlined, 'Филиалы', () => ResourcePage(branchesConfig)),
        row(Icons.table_restaurant_outlined, 'Места (залы и столы)', () => const HallsPage()),
        row(Icons.people_outline, 'Клиенты', () => const ClientsPage()),
        row(Icons.credit_card, 'Способы оплаты', () => ResourcePage(paymentMethodsConfig)),
        row(Icons.straighten, 'Единицы измерения', () => ResourcePage(unitsConfig)),
        row(Icons.print_outlined, 'Принтеры', () => ResourcePage(printersConfig)),
        row(Icons.receipt_long_outlined, 'Чек клиента', () => const ReceiptSettingsPage(kitchen: false)),
        row(Icons.soup_kitchen_outlined, 'Чек кухни', () => const ReceiptSettingsPage(kitchen: true)),
        row(Icons.support_agent, 'Тех. поддержка', () => const SupportPage()),
        row(Icons.privacy_tip_outlined, 'Политика конфиденциальности', () => const PrivacyPage()),
      ]),
    );
  }
}

/// Organization profile: name, phone, address, currency-related rates.
class CompanyProfilePage extends StatefulWidget {
  const CompanyProfilePage({super.key});
  @override
  State<CompanyProfilePage> createState() => _CompanyProfilePageState();
}

class _CompanyProfilePageState extends State<CompanyProfilePage> {
  final c = <String, TextEditingController>{};
  bool ready = false;
  bool busy = false;
  String? error;

  static const _fields = {
    'name': 'Название',
    'phone': 'Телефон',
    'address': 'Адрес',
    'inn': 'ИНН',
    'vat_rate': 'НДС, %',
    'service_fee': 'Сервисный сбор, %',
    'waiter_service_percent': 'Процент официанта, %',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = asJson(await Api.i.get('/companies/me'));
      for (final k in _fields.keys) {
        c[k] = TextEditingController(text: d[k] == null ? '' : '${d[k]}');
      }
      ready = true;
    } on ApiError catch (e) {
      error = e.message;
    }
    if (mounted) setState(() {});
  }

  Future<void> _save() async {
    if (busy) return;
    final body = <String, dynamic>{};
    for (final e in c.entries) {
      final v = e.value.text.trim();
      if (v.isEmpty) continue;
      body[e.key] = ['vat_rate', 'service_fee'].contains(e.key) ? num.tryParse(v.replaceAll(',', '.')) : (e.key == 'waiter_service_percent' ? int.tryParse(v) : v);
    }
    setState(() => busy = true);
    try {
      await Api.i.patch('/companies/me', data: body);
      if (mounted) toast(context, 'Сохранено');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user;
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль организации')),
      body: !ready
          ? (error != null ? ErrorState('Не удалось загрузить: $error', onRetry: _load) : const Center(child: CircularProgressIndicator()))
          : ListView(padding: const EdgeInsets.all(16), children: [
              Card2(child: Row(children: [
                Avatar(context.read<Session>().displayName, size: 44),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(context.read<Session>().displayName, style: MT.body.copyWith(fontWeight: FontWeight.w600)), Text('${user?['email'] ?? user?['phone'] ?? ''}', style: MT.small)])),
              ])),
              const SizedBox(height: 16),
              for (final e in _fields.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Labeled(e.value, TextField(controller: c[e.key], keyboardType: ['vat_rate', 'service_fee', 'waiter_service_percent'].contains(e.key) ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text)),
                ),
              BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
            ]),
    );
  }
}

/// Halls with their tables.
class HallsPage extends StatelessWidget {
  const HallsPage({super.key});
  static final _cfg = ResourceConfig(
    title: 'Места',
    path: '/halls',
    icon: Icons.table_restaurant_outlined,
    createLabel: 'Новый зал',
    emptyText: 'Залов пока нет',
    itemTitle: (r) => '${r['name']}',
    itemSubtitle: (r) => [if (r['description'] != null) '${r['description']}', if (r['percent'] != null) 'обслуживание ${r['percent']}%'].join(' · '),
    fields: const [
      Field('name', 'Название', required: true),
      Field('description', 'Описание'),
      Field('percent', 'Обслуживание, %', type: FieldType.number),
      Field('is_active', 'Активен', type: FieldType.toggle, defaultValue: true),
    ],
  );

  @override
  Widget build(BuildContext context) => _HallsList();
}

class _HallsList extends StatefulWidget {
  @override
  State<_HallsList> createState() => _HallsListState();
}

class _HallsListState extends State<_HallsList> {
  int gen = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Места')),
        floatingActionButton: FloatingActionButton.extended(
          icon: const Icon(Icons.add),
          label: const Text('Новый зал'),
          onPressed: () async {
            final ok = await push<bool>(context, ResourceForm(config: HallsPage._cfg));
            if (ok == true) setState(() => gen++);
          },
        ),
        body: AsyncBody<List<Json>>(
          reloadKey: gen,
          load: () async => asJsonList(await Api.i.get('/halls')),
          builder: (_, rows, reload) => rows.isEmpty
              ? const EmptyState('Залов пока нет', icon: Icons.table_restaurant_outlined)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => Card2(
                    onTap: () async {
                      await push(context, HallDetailPage(hall: rows[i]));
                      reload();
                    },
                    child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${rows[i]['name']}', style: MT.body.copyWith(fontWeight: FontWeight.w600)), if ((HallsPage._cfg.itemSubtitle!(rows[i]) ?? '').isNotEmpty) Text(HallsPage._cfg.itemSubtitle!(rows[i])!, style: MT.small)])),
                      if (rows[i]['is_active'] == false) Pill('Неактивен'),
                      const Icon(Icons.chevron_right, color: MC.n300),
                    ]),
                  ),
                ),
        ),
      );
}

class HallDetailPage extends StatelessWidget {
  const HallDetailPage({super.key, required this.hall});
  final Json hall;

  @override
  Widget build(BuildContext context) {
    final tables = ResourceConfig(
      title: 'Столы',
      path: '/halls/${hall['id']}/tables',
      icon: Icons.table_bar_outlined,
      createLabel: 'Новый стол',
      emptyText: 'Столов пока нет',
      itemTitle: (r) => 'Стол ${r['number']}',
      itemSubtitle: (r) => '${r['capacity']} мест',
      itemTrailing: (r) => r['is_active'] == false ? Pill('Неактивен') : null,
      fields: const [
        Field('number', 'Номер', type: FieldType.number, required: true),
        Field('capacity', 'Вместимость', type: FieldType.number, defaultValue: 4),
        Field('is_active', 'Активен', type: FieldType.toggle, defaultValue: true),
      ],
    );
    return Scaffold(
      appBar: AppBar(title: Text('${hall['name']}'), actions: [
        IconBtn(icon: Icons.edit_outlined, tooltip: 'Изменить зал', onTap: () async {
          final ok = await push<bool>(context, ResourceForm(config: HallsPage._cfg, item: hall));
          if (ok == true && context.mounted) Navigator.of(context).pop();
        }),
      ]),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Стол'),
        onPressed: () async {
          final ok = await push<bool>(context, ResourceForm(config: tables));
          if (ok == true && context.mounted) {
            Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HallDetailPage(hall: hall)));
          }
        },
      ),
      body: ResourcePage(tables, embedded: true),
    );
  }
}
