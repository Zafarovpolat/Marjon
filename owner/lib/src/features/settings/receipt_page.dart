import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';

const _customerBlocks = ['logo', 'restaurantName', 'address', 'phone', 'orderNumber', 'table', 'waiter', 'dateTime', 'items', 'discount', 'serviceFee', 'vat', 'total', 'paymentMethod', 'qr', 'thankYouText', 'footerText'];
const _kitchenBlocks = ['orderNumber', 'table', 'waiter', 'createdAt', 'items', 'modifiers', 'itemComments', 'orderNote', 'priority'];

const _customerLabels = {
  'logo': 'Логотип', 'restaurantName': 'Название ресторана', 'address': 'Адрес', 'phone': 'Телефон', 'orderNumber': 'Номер заказа', 'table': 'Стол',
  'waiter': 'Официант', 'dateTime': 'Дата и время', 'items': 'Позиции', 'discount': 'Скидка', 'serviceFee': 'Сервисный сбор', 'vat': 'НДС',
  'total': 'Итого', 'paymentMethod': 'Способ оплаты', 'qr': 'QR', 'thankYouText': 'Текст благодарности', 'footerText': 'Нижний текст',
};
const _kitchenLabels = {
  'orderNumber': 'Номер заказа', 'table': 'Стол', 'waiter': 'Официант', 'createdAt': 'Время создания', 'items': 'Позиции', 'modifiers': 'Модификаторы',
  'itemComments': 'Комментарии к позициям', 'orderNote': 'Комментарий заказа', 'priority': 'Приоритет',
};
const _offByDefault = {'address', 'phone', 'qr', 'vat'};

/// Receipt template editor (customer receipt or kitchen ticket): paper size, texts, block order and visibility.
class ReceiptSettingsPage extends StatefulWidget {
  const ReceiptSettingsPage({super.key, required this.kitchen});
  final bool kitchen;
  @override
  State<ReceiptSettingsPage> createState() => _ReceiptSettingsPageState();
}

class _ReceiptSettingsPageState extends State<ReceiptSettingsPage> {
  bool loading = true;
  bool busy = false;
  String? error;
  String paper = '80mm';
  bool autoPrint = false;
  List<String> blocks = [];
  Map<String, bool> enabled = {};
  final name = TextEditingController();
  final address = TextEditingController();
  final phone = TextEditingController();
  final thanks = TextEditingController(text: 'XARIDINGIZ\nUCHUN RAXMAT!');
  final footer = TextEditingController();
  Json extra = {};

  List<String> get _all => widget.kitchen ? _kitchenBlocks : _customerBlocks;
  Map<String, String> get _labels => widget.kitchen ? _kitchenLabels : _customerLabels;
  String get _path => widget.kitchen ? '/settings/kitchen-receipt-template' : '/settings/receipt-template';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = asJson(await Api.i.get(_path));
      Json org = {};
      if (!widget.kitchen) {
        try {
          org = asJson(await Api.i.get('/companies/me'));
        } catch (_) {}
      }
      extra = d;
      paper = '${d['paperSize'] ?? '80mm'}';
      autoPrint = d['autoPrint'] == true;
      final saved = (d['blocks'] as List?)?.map((e) => '$e').toList() ?? [];
      blocks = [...saved.where(_all.contains), ..._all.where((b) => !saved.contains(b))];
      final en = asJson(d['enabled']);
      enabled = {for (final b in _all) b: en[b] is bool ? en[b] as bool : !(!widget.kitchen && _offByDefault.contains(b))};
      name.text = '${d['restaurantName'] ?? org['name'] ?? 'MARJON'}';
      address.text = '${d['address'] ?? org['address'] ?? ''}';
      phone.text = '${d['phone'] ?? org['phone'] ?? ''}';
      if (d['thankYouText'] != null) thanks.text = '${d['thankYouText']}';
      footer.text = '${d['footerText'] ?? org['phone'] ?? ''}';
    } on ApiError catch (e) {
      error = e.message;
    }
    if (mounted) setState(() => loading = false);
  }

  void _move(int i, int d) {
    final j = i + d;
    if (j < 0 || j >= blocks.length) return;
    setState(() => blocks.insert(j, blocks.removeAt(i)));
  }

  Future<void> _save() async {
    if (busy) return;
    final body = <String, dynamic>{...extra, 'paperSize': paper, 'blocks': blocks, 'enabled': enabled};
    if (widget.kitchen) {
      body['autoPrint'] = autoPrint;
    } else {
      body.addAll({'restaurantName': name.text.trim(), 'address': address.text.trim(), 'phone': phone.text.trim(), 'thankYouText': thanks.text, 'footerText': footer.text});
    }
    setState(() => busy = true);
    try {
      await Api.i.patch(_path, data: body);
      if (mounted) toast(context, 'Шаблон сохранён');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<String> _preview() {
    final w = paper == '58mm' ? 32 : 42;
    String center(String s) => s.length >= w ? s : (' ' * ((w - s.length) ~/ 2)) + s;
    final out = <String>[];
    for (final b in blocks.where((b) => enabled[b] == true)) {
      switch (b) {
        case 'logo': out.add(center('[ LOGO ]'));
        case 'restaurantName': out.add(center(name.text.toUpperCase()));
        case 'address': out.add(center(address.text));
        case 'phone': out.add(center(phone.text));
        case 'orderNumber': out.add(center('Заказ #128'));
        case 'table': out.add('Стол: 5');
        case 'waiter': out.add('Официант: Иван');
        case 'dateTime': out.add(center('25.09.2026 14:32'));
        case 'createdAt': out.add('Создан: 14:32');
        case 'items':
          out..add('-' * w)..add('Плов ×2'.padRight(w - 10) + '70 000')..add('Чай ×1'.padRight(w - 10) + '8 000')..add('-' * w);
        case 'modifiers': out.add('  + без лука');
        case 'itemComments': out.add('  * поострее');
        case 'orderNote': out.add('Заметка: без соли');
        case 'priority': out.add('!! СРОЧНО');
        case 'discount': out.add('Скидка'.padRight(w - 8) + '−5 000');
        case 'serviceFee': out.add('Сервис'.padRight(w - 8) + '7 800');
        case 'vat': out.add('НДС'.padRight(w - 8) + '9 360');
        case 'total': out.add('ИТОГО'.padRight(w - 10) + '73 000');
        case 'paymentMethod': out.add('Оплата: наличные');
        case 'qr': out.add(center('[ QR ]'));
        case 'thankYouText': out.addAll(thanks.text.split('\n').map(center));
        case 'footerText': out.addAll(footer.text.split('\n').map(center));
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.kitchen ? 'Чек кухни' : 'Чек клиента')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? ErrorState('Не удалось загрузить: $error', onRetry: _load)
                : ListView(padding: const EdgeInsets.all(16), children: [
                    Labeled('Размер бумаги', SegmentedButton<String>(segments: const [ButtonSegment(value: '58mm', label: Text('58 мм')), ButtonSegment(value: '80mm', label: Text('80 мм'))], selected: {paper}, onSelectionChanged: (s) => setState(() => paper = s.first))),
                    if (widget.kitchen) SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Печатать автоматически'), value: autoPrint, onChanged: (v) => setState(() => autoPrint = v)),
                    if (!widget.kitchen) ...[
                      const SizedBox(height: 14),
                      Labeled('Название', TextField(controller: name, onChanged: (_) => setState(() {}))),
                      const SizedBox(height: 12),
                      Labeled('Адрес', TextField(controller: address, onChanged: (_) => setState(() {}))),
                      const SizedBox(height: 12),
                      Labeled('Телефон', TextField(controller: phone, onChanged: (_) => setState(() {}))),
                      const SizedBox(height: 12),
                      Labeled('Текст благодарности', TextField(controller: thanks, maxLines: 2, onChanged: (_) => setState(() {}))),
                      const SizedBox(height: 12),
                      Labeled('Нижний текст', TextField(controller: footer, maxLines: 2, onChanged: (_) => setState(() {}))),
                    ],
                    const SectionLabel('Блоки чека'),
                    Card2(
                      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                      child: Column(children: [
                        for (var i = 0; i < blocks.length; i++)
                          Row(children: [
                            Switch(value: enabled[blocks[i]] == true, onChanged: (v) => setState(() => enabled[blocks[i]] = v)),
                            Expanded(child: Text(_labels[blocks[i]] ?? blocks[i], style: MT.body)),
                            IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.arrow_upward, size: 20), onPressed: i == 0 ? null : () => _move(i, -1)),
                            IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.arrow_downward, size: 20), onPressed: i == blocks.length - 1 ? null : () => _move(i, 1)),
                          ]),
                      ]),
                    ),
                    const SectionLabel('Предпросмотр'),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(MC.rMd), border: Border.all(color: MC.border)),
                      child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Text(_preview().join('\n'), style: const TextStyle(fontFamily: MC.fontMono, fontSize: 11, height: 1.35, color: MC.n900))),
                    ),
                    const SizedBox(height: 16),
                    BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
                  ]),
      );
}
