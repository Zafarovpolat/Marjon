import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';

/// Dishes: list with search; tap opens the full editor (fields, photo, modifiers).
class DishesPage extends StatefulWidget {
  const DishesPage({super.key});
  @override
  State<DishesPage> createState() => _DishesPageState();
}

class _DishesPageState extends State<DishesPage> {
  int gen = 0;
  String q = '';

  Future<void> _open(Json? d) async {
    final ok = await push<bool>(context, DishEditPage(dish: d));
    if (ok == true) setState(() => gen++);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Блюда')),
        floatingActionButton: FloatingActionButton.extended(onPressed: () => _open(null), icon: const Icon(Icons.add), label: const Text('Новое блюдо')),
        body: AsyncBody<List<Json>>(
          reloadKey: gen,
          load: () async => asJsonList(await Api.i.get('/inventory/products')),
          builder: (_, all, reload) {
            final rows = all.where((r) => q.isEmpty || '${r['name']}'.toLowerCase().contains(q.toLowerCase())).toList();
            return Column(children: [
              Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: TextField(onChanged: (v) => setState(() => q = v), decoration: const InputDecoration(hintText: 'Поиск блюда', prefixIcon: Icon(Icons.search), isDense: true))),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: reload,
                  child: rows.isEmpty
                      ? ListView(children: const [SizedBox(height: 300, child: EmptyState('Блюд пока нет', icon: Icons.restaurant_menu))])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                          itemCount: rows.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = rows[i];
                            final img = r['image_url'] as String?;
                            return Card2(
                              padding: const EdgeInsets.all(10),
                              onTap: () => _open(r),
                              child: Row(children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(MC.rMd),
                                  child: SizedBox(width: 52, height: 52, child: img != null && img.isNotEmpty ? Image.network(img, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const _Ph()) : const _Ph()),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text('${r['name']}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                    Text([if (r['category_name'] != null) '${r['category_name']}', if (r['is_active'] == false) 'неактивно', if (r['is_available'] == false) 'в стопе'].join(' · '), style: MT.small),
                                  ]),
                                ),
                                Text(fmtMoney(toNum(r['price'])), style: MT.money),
                              ]),
                            );
                          },
                        ),
                ),
              ),
            ]);
          },
        ),
      );
}

class _Ph extends StatelessWidget {
  const _Ph();
  @override
  Widget build(BuildContext context) => Container(color: MC.n100, child: const Icon(Icons.restaurant, color: MC.n300));
}

class DishEditPage extends StatefulWidget {
  const DishEditPage({super.key, this.dish});
  final Json? dish;
  @override
  State<DishEditPage> createState() => _DishEditPageState();
}

class _DishEditPageState extends State<DishEditPage> {
  late Json dish = {...?widget.dish};
  late final name = TextEditingController(text: '${dish['name'] ?? ''}');
  late final price = TextEditingController(text: dish['price'] == null ? '' : '${toNum(dish['price'])}');
  late final cost = TextEditingController(text: dish['cost_price'] == null ? '' : '${toNum(dish['cost_price'])}');
  late final unit = TextEditingController(text: '${dish['unit'] ?? 'шт'}');
  late final desc = TextEditingController(text: '${dish['description'] ?? ''}');
  late final sort = TextEditingController(text: '${dish['sort_order'] ?? 0}');
  String? categoryId;
  String? printerId;
  late bool active = dish['is_active'] != false;
  Map<String, String> categories = {};
  Map<String, String> printers = {};
  bool busy = false;
  int modGen = 0;

  bool get isNew => dish['id'] == null;

  @override
  void initState() {
    super.initState();
    categoryId = dish['category_id']?.toString();
    printerId = dish['printer_id']?.toString();
    Api.i.get('/inventory/categories').then((d) {
      if (mounted) setState(() => categories = {for (final r in asJsonList(d)) '${r['id']}': '${r['name']}'});
    }).catchError((_) {});
    Api.i.get('/printers').then((d) {
      if (mounted) setState(() => printers = {for (final r in asJsonList(d)) '${r['id']}': '${r['name']}'});
    }).catchError((_) {});
  }

  Future<void> _save() async {
    if (busy) return;
    final p = num.tryParse(price.text.trim().replaceAll(',', '.'));
    if (name.text.trim().isEmpty || p == null) {
      toast(context, 'Укажите название и цену', error: true);
      return;
    }
    final body = <String, dynamic>{
      'name': name.text.trim(),
      'price': p,
      'cost_price': num.tryParse(cost.text.trim().replaceAll(',', '.')),
      'category_id': categoryId,
      'printer_id': printerId,
      'unit': unit.text.trim().isEmpty ? 'шт' : unit.text.trim(),
      'description': desc.text.trim().isEmpty ? null : desc.text.trim(),
      'sort_order': int.tryParse(sort.text.trim()) ?? 0,
      'is_active': active,
    };
    setState(() => busy = true);
    try {
      if (isNew) {
        final c = asJson(await Api.i.post('/inventory/products', data: {...body, 'product_type': 'dish'}));
        if (mounted) {
          toast(context, 'Блюдо создано — теперь можно добавить фото и модификаторы');
          setState(() => dish = c);
        }
      } else {
        await Api.i.patch('/inventory/products/${dish['id']}', data: body);
        if (mounted) {
          toast(context, 'Сохранено');
          Navigator.of(context).pop(true);
        }
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _photo() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (x == null) return;
    setState(() => busy = true);
    try {
      final bytes = await x.readAsBytes();
      final ext = x.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
      final form = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: x.name, contentType: DioMediaType('image', ext))});
      final r = await Api.i.post('/inventory/products/${dish['id']}/photo', data: form);
      if (mounted) setState(() => dish = asJson(r));
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'Удалить блюдо «${dish['name']}»?')) return;
    try {
      await Api.i.delete('/inventory/products/${dish['id']}');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = dish['id'] != null;
    final img = dish['image_url'] as String?;
    return Scaffold(
      appBar: AppBar(title: Text(saved ? 'Блюдо' : 'Новое блюдо'), actions: [if (saved) IconBtn(icon: Icons.delete_outline, color: MC.red500, onTap: _delete, tooltip: 'Удалить')]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (saved)
          GestureDetector(
            onTap: busy ? null : _photo,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(MC.rLg),
              child: SizedBox(
                height: 170,
                child: Stack(fit: StackFit.expand, children: [
                  img != null && img.isNotEmpty ? Image.network(img, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const _Ph()) : const _Ph(),
                  Positioned(right: 10, bottom: 10, child: Pill('Изменить фото', bg: MC.n900, fg: Colors.white, icon: Icons.photo_camera_outlined)),
                ]),
              ),
            ),
          ),
        if (saved) const SizedBox(height: 16),
        Labeled('Название *', TextField(controller: name)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: Labeled('Цена, сум *', TextField(controller: price, keyboardType: const TextInputType.numberWithOptions(decimal: true)))),
          const SizedBox(width: 12),
          Expanded(child: Labeled('Себестоимость', TextField(controller: cost, keyboardType: const TextInputType.numberWithOptions(decimal: true)))),
        ]),
        const SizedBox(height: 12),
        Labeled('Категория', DropdownButtonFormField<String>(initialValue: categories.containsKey(categoryId) ? categoryId : null, isExpanded: true, hint: const Text('Не выбрана'), items: [for (final e in categories.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => categoryId = v))),
        const SizedBox(height: 12),
        Labeled('Принтер', DropdownButtonFormField<String>(initialValue: printers.containsKey(printerId) ? printerId : null, isExpanded: true, hint: const Text('По умолчанию'), items: [for (final e in printers.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => printerId = v))),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: Labeled('Единица', TextField(controller: unit))),
          const SizedBox(width: 12),
          Expanded(child: Labeled('Порядок', TextField(controller: sort, keyboardType: TextInputType.number))),
        ]),
        const SizedBox(height: 12),
        Labeled('Описание', TextField(controller: desc, maxLines: 3)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Активно'), value: active, onChanged: (v) => setState(() => active = v)),
        const SizedBox(height: 8),
        BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
        if (saved) ...[
          SectionLabel('Модификаторы', trailing: TextButton.icon(onPressed: () async {
            final ok = await push<bool>(context, ModifierGroupPage(productId: '${dish['id']}'));
            if (ok == true) setState(() => modGen++);
          }, icon: const Icon(Icons.add, size: 18), label: const Text('Группа'))),
          AsyncBody<List<Json>>(
            key: ValueKey(modGen),
            load: () async => asJsonList(await Api.i.get('/inventory/products/${dish['id']}/modifier-groups')),
            builder: (_, groups, __) => groups.isEmpty
                ? const Card2(child: Text('Групп модификаторов нет', style: MT.bodyMuted))
                : Column(children: [
                    for (final g in groups)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Card2(
                          onTap: () async {
                            final ok = await push<bool>(context, ModifierGroupPage(productId: '${dish['id']}', group: g));
                            if (ok == true) setState(() => modGen++);
                          },
                          child: Row(children: [
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${g['name']}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                              Text('${asJsonList(g['modifiers']).map((m) => m['name']).join(', ')}', style: MT.small, maxLines: 1, overflow: TextOverflow.ellipsis),
                            ])),
                            if (g['is_required'] == true) Pill('Обязательно', bg: MC.amber100, fg: MC.amber700),
                            const Icon(Icons.chevron_right, color: MC.n300),
                          ]),
                        ),
                      ),
                  ]),
          ),
        ],
      ]),
    );
  }
}

class _OptRow {
  _OptRow({String n = '', String p = '0', this.id, this.isDefault = false})
      : name = TextEditingController(text: n),
        delta = TextEditingController(text: p);
  final String? id;
  final TextEditingController name;
  final TextEditingController delta;
  bool isDefault;
}

class ModifierGroupPage extends StatefulWidget {
  const ModifierGroupPage({super.key, required this.productId, this.group});
  final String productId;
  final Json? group;
  @override
  State<ModifierGroupPage> createState() => _ModifierGroupPageState();
}

class _ModifierGroupPageState extends State<ModifierGroupPage> {
  late final name = TextEditingController(text: '${widget.group?['name'] ?? ''}');
  late final minSel = TextEditingController(text: '${widget.group?['min_select'] ?? 0}');
  late final maxSel = TextEditingController(text: '${widget.group?['max_select'] ?? 1}');
  late bool required = widget.group?['is_required'] == true;
  late bool showInPos = widget.group?['show_in_pos'] != false;
  late final List<_OptRow> opts = [
    for (final m in asJsonList(widget.group?['modifiers'])) _OptRow(n: '${m['name']}', p: '${toNum(m['price_delta'])}', id: '${m['id']}', isDefault: m['is_default'] == true),
    if (widget.group == null) _OptRow(),
  ];
  bool busy = false;

  Future<void> _save() async {
    if (busy) return;
    if (name.text.trim().isEmpty) {
      toast(context, 'Укажите название группы', error: true);
      return;
    }
    final body = {
      'name': name.text.trim(),
      'min_select': int.tryParse(minSel.text) ?? 0,
      'max_select': (int.tryParse(maxSel.text) ?? 1).clamp(1, 99),
      'is_required': required,
      'show_in_pos': showInPos,
      'modifiers': [
        for (var i = 0; i < opts.length; i++)
          if (opts[i].name.text.trim().isNotEmpty) {if (opts[i].id != null) 'id': opts[i].id, 'name': opts[i].name.text.trim(), 'price_delta': num.tryParse(opts[i].delta.text.replaceAll(',', '.')) ?? 0, 'is_default': opts[i].isDefault, 'sort_order': i},
      ],
    };
    setState(() => busy = true);
    try {
      if (widget.group == null) {
        await Api.i.post('/inventory/modifier-groups', data: {...body, 'product_id': widget.productId});
      } else {
        await Api.i.patch('/inventory/modifier-groups/${widget.group!['id']}', data: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'Удалить группу «${widget.group!['name']}»?')) return;
    try {
      await Api.i.delete('/inventory/modifier-groups/${widget.group!['id']}');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.group == null ? 'Новая группа' : 'Группа модификаторов'), actions: [if (widget.group != null) IconBtn(icon: Icons.delete_outline, color: MC.red500, onTap: _delete)]),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Labeled('Название *', TextField(controller: name)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: Labeled('Мин. выбор', TextField(controller: minSel, keyboardType: TextInputType.number))),
            const SizedBox(width: 12),
            Expanded(child: Labeled('Макс. выбор', TextField(controller: maxSel, keyboardType: TextInputType.number))),
          ]),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Обязательная'), value: required, onChanged: (v) => setState(() => required = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Показывать в кассе'), value: showInPos, onChanged: (v) => setState(() => showInPos = v)),
          const SectionLabel('Опции'),
          for (var i = 0; i < opts.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Expanded(flex: 3, child: TextField(controller: opts[i].name, decoration: const InputDecoration(labelText: 'Название'))),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: TextField(controller: opts[i].delta, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(labelText: '+ цена'))),
                IconBtn(icon: opts[i].isDefault ? Icons.star : Icons.star_border, color: MC.amber500, tooltip: 'По умолчанию', onTap: () => setState(() => opts[i].isDefault = !opts[i].isDefault)),
                IconBtn(icon: Icons.close, color: MC.red500, onTap: () => setState(() => opts.removeAt(i))),
              ]),
            ),
          GhostButton(label: 'Добавить опцию', icon: Icons.add, onPressed: () => setState(() => opts.add(_OptRow()))),
          const SizedBox(height: 20),
          BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
        ]),
      );
}
