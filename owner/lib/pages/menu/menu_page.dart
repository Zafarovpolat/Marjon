import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class MenuPage extends StatefulWidget {
  const MenuPage({super.key});
  @override
  State<MenuPage> createState() => _MenuPageState();
}

class _MenuPageState extends State<MenuPage> {
  List<dynamic> _categories = [];
  List<dynamic> _products = [];
  String? _activeCat;
  String _search = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await Future.wait([Api().categories(), Api().products()]);
      if (!mounted) return;
      setState(() { _categories = res[0]; _products = res[1]; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> get _filtered => _products.where((p) {
    if (_activeCat != null && p['category_id'] != _activeCat) return false;
    if (_search.isNotEmpty && !(p['name'] as String).toLowerCase().contains(_search.toLowerCase())) return false;
    return true;
  }).toList();

  String _catName(String? id) {
    if (id == null) return 'Без категории';
    final c = _categories.where((c) => c['id'] == id).firstOrNull;
    return c?['name'] ?? '—';
  }

  Future<void> _addCategory() async {
    final name = await _inputDialog('Новая категория', 'Название');
    if (name == null || name.isEmpty) return;
    try {
      await Api().createCategory({'name': name, 'slug': name.toLowerCase().replaceAll(' ', '-')});
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  Future<void> _addProduct() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _ProductForm(categories: _categories),
    );
    if (result == null) return;
    try {
      await Api().createProduct(result);
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  Future<void> _editProduct(Map<String, dynamic> product) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _ProductForm(categories: _categories, initial: product),
    );
    if (result == null) return;
    try {
      await Api().updateProduct(product['id'], result);
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  Future<void> _toggleActive(Map<String, dynamic> p) async {
    try {
      await Api().updateProduct(p['id'], {'is_active': !(p['is_active'] as bool)});
      _load();
    } catch (_) {}
  }

  Future<String?> _inputDialog(String title, String hint) async {
    final ctrl = TextEditingController();
    return showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: T.surface,
      title: Text(title),
      content: TextField(controller: ctrl, decoration: InputDecoration(hintText: hint), autofocus: true),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
        ElevatedButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Создать')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Меню'),
        actions: [
          PopupMenuButton(
            icon: const Icon(Icons.add),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'cat', child: Text('Добавить категорию')),
              const PopupMenuItem(value: 'prod', child: Text('Добавить блюдо')),
            ],
            onSelected: (v) { if (v == 'cat') _addCategory(); else _addProduct(); },
          ),
        ],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: const InputDecoration(hintText: 'Поиск...', prefixIcon: Icon(Icons.search), isDense: true),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            if (_categories.isNotEmpty) SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  _chip('Все (${_products.length})', _activeCat == null, () => setState(() => _activeCat = null)),
                  ..._categories.map((c) {
                    final cnt = _products.where((p) => p['category_id'] == c['id']).length;
                    return _chip('${c['name']} ($cnt)', _activeCat == c['id'],
                      () => setState(() => _activeCat = _activeCat == c['id'] ? null : c['id']));
                  }),
                ],
              ),
            ),
            Expanded(child: RefreshIndicator(
              onRefresh: _load,
              child: _filtered.isEmpty
                ? const Center(child: Text('Нет блюд', style: TextStyle(color: T.muted)))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final p = _filtered[i];
                      final active = p['is_active'] == true;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: T.surface, borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: active ? T.border : T.danger.withValues(alpha: 0.3), width: 0.5),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                          title: Text(p['name'], style: TextStyle(
                            fontWeight: FontWeight.w500,
                            decoration: active ? null : TextDecoration.lineThrough,
                            color: active ? T.text : T.muted,
                          )),
                          subtitle: Text('${_catName(p['category_id'])} · ${p['unit'] ?? 'шт'}',
                            style: const TextStyle(color: T.muted, fontSize: 13)),
                          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text(_fmt(p['price']),
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: T.accent)),
                            const SizedBox(width: 8),
                            Switch(
                              value: active,
                              activeColor: T.success,
                              onChanged: (_) => _toggleActive(p),
                            ),
                          ]),
                          onTap: () => _editProduct(Map<String, dynamic>.from(p)),
                        ),
                      );
                    },
                  ),
            )),
          ]),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: FilterChip(label: Text(label, style: TextStyle(fontSize: 13, color: active ? T.accent : T.muted)),
      selected: active, selectedColor: T.accent.withValues(alpha: 0.15), onSelected: (_) => onTap()),
  );
}

// ── Product form bottom sheet ────────────────────────────────────────────────

class _ProductForm extends StatefulWidget {
  final List<dynamic> categories;
  final Map<String, dynamic>? initial;
  const _ProductForm({required this.categories, this.initial});
  @override
  State<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<_ProductForm> {
  late final TextEditingController _name;
  late final TextEditingController _price;
  String? _catId;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.initial?['name'] ?? '');
    _price = TextEditingController(text: widget.initial != null ? widget.initial!['price'].toString() : '');
    _catId = widget.initial?['category_id'];
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(isEdit ? 'Редактировать блюдо' : 'Новое блюдо',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Название'), autofocus: !isEdit),
        const SizedBox(height: 12),
        TextField(controller: _price, decoration: const InputDecoration(labelText: 'Цена (сум)'),
          keyboardType: TextInputType.number),
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          value: _catId,
          decoration: const InputDecoration(labelText: 'Категория'),
          dropdownColor: T.surface,
          items: [
            const DropdownMenuItem(value: null, child: Text('Без категории')),
            ...widget.categories.map((c) => DropdownMenuItem(value: c['id'] as String, child: Text(c['name']))),
          ],
          onChanged: (v) => setState(() => _catId = v),
        ),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () {
            if (_name.text.isEmpty || _price.text.isEmpty) return;
            Navigator.pop(context, {
              'name': _name.text,
              'price': _price.text,
              if (_catId != null) 'category_id': _catId,
            });
          },
          child: Text(isEdit ? 'Сохранить' : 'Создать'),
        )),
      ]),
    );
  }
}

String _fmt(dynamic v) {
  final n = num.tryParse(v.toString()) ?? 0;
  return n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
