import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

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
      if (mounted) _showError('$e');
    }
  }

  Future<void> _addProduct() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductForm(categories: _categories),
    );
    if (result == null) return;

    final data = Map<String, dynamic>.from(result['data'] as Map<String, dynamic>);
    final bytes = result['photoBytes'] as List<int>?;
    final fname = result['photoName'] as String?;

    if (bytes != null && fname != null) {
      try {
        data['image_url'] = await Api().uploadImage(bytes, fname);
      } catch (_) {
        // Create product without photo if upload fails
      }
    }

    try {
      await Api().createProduct(data);
      _load();
    } catch (e) {
      if (mounted) _showError('$e');
    }
  }

  Future<void> _editProduct(Map<String, dynamic> product) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductForm(categories: _categories, initial: product),
    );
    if (result == null) return;

    final data = Map<String, dynamic>.from(result['data'] as Map<String, dynamic>);
    final bytes = result['photoBytes'] as List<int>?;
    final fname = result['photoName'] as String?;

    // Upload photo first → include URL in PATCH body (one round-trip less, no separate endpoint needed)
    if (bytes != null && fname != null) {
      try {
        data['image_url'] = await Api().uploadImage(bytes, fname);
      } catch (e) {
        if (mounted) _showError('Не удалось загрузить фото: $e');
        // Continue saving without photo
      }
    }

    try {
      await Api().updateProduct(product['id'], data);
      _load();
    } catch (e) {
      if (mounted) _showError('$e');
    }
  }

  Future<void> _toggleActive(Map<String, dynamic> p) async {
    final id = p['id'] as String;
    final newActive = !(p['is_active'] as bool);
    // Optimistic local update so the switch flips instantly without waiting for the server
    setState(() {
      final idx = _products.indexWhere((item) => item['id'] == id);
      if (idx != -1) {
        _products[idx] = Map<String, dynamic>.from(_products[idx])
          ..['is_active'] = newActive;
      }
    });
    try {
      await Api().updateProduct(id, {'is_active': newActive});
      _load();
    } catch (_) {
      // Revert on failure
      setState(() {
        final idx = _products.indexWhere((item) => item['id'] == id);
        if (idx != -1) {
          _products[idx] = Map<String, dynamic>.from(_products[idx])
            ..['is_active'] = !newActive;
        }
      });
    }
  }

  Future<String?> _inputDialog(String title, String hint) async {
    final ctrl = TextEditingController();
    return showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: T.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(title, style: const TextStyle(color: T.text, fontWeight: FontWeight.w700)),
      content: TextField(controller: ctrl,
        decoration: InputDecoration(hintText: hint), autofocus: true),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Отмена', style: TextStyle(color: T.muted))),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, ctrl.text),
          child: const Text('Создать')),
      ],
    ));
  }

  void _showError(String msg) => ScaffoldMessenger.of(context)
    .showSnackBar(SnackBar(content: Text('Ошибка: $msg'), backgroundColor: T.danger));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        title: const Text('Меню'),
        backgroundColor: T.surface,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: T.border)),
        actions: [
          PopupMenuButton(
            icon: Container(
              width: 34, height: 34, alignment: Alignment.center,
              decoration: BoxDecoration(
                color: T.accent, borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.add, color: Colors.white, size: 18)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'cat',
                child: Row(children: [
                  Icon(Icons.folder_outlined, color: T.accent, size: 18),
                  const SizedBox(width: 10),
                  const Text('Добавить категорию'),
                ])),
              PopupMenuItem(
                value: 'prod',
                child: Row(children: [
                  Icon(Icons.restaurant_outlined, color: T.accent, size: 18),
                  const SizedBox(width: 10),
                  const Text('Добавить блюдо'),
                ])),
            ],
            onSelected: (v) => v == 'cat' ? _addCategory() : _addProduct(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
        ? const LoadingCenter()
        : Column(children: [
            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Поиск блюда...',
                  prefixIcon: const Icon(Icons.search, size: 20, color: T.muted),
                  isDense: true,
                  filled: true, fillColor: T.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: T.border)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: T.border)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: T.accent, width: 1.5)),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            // Category chips
            if (_categories.isNotEmpty) SizedBox(
              height: 50,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                children: [
                  _chip('Все (${_products.length})', _activeCat == null,
                    () => setState(() => _activeCat = null)),
                  ..._categories.map((c) {
                    final cnt = _products.where((p) => p['category_id'] == c['id']).length;
                    return _chip('${c['name']} ($cnt)', _activeCat == c['id'],
                      () => setState(() => _activeCat = _activeCat == c['id'] ? null : c['id']));
                  }),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Expanded(child: RefreshIndicator(
              color: T.accent,
              backgroundColor: T.surface,
              onRefresh: _load,
              child: _filtered.isEmpty
                ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.restaurant_menu_outlined, size: 56, color: T.border),
                    const SizedBox(height: 12),
                    const Text('Нет блюд', style: TextStyle(color: T.muted, fontSize: 15)),
                  ]))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) => _ProductCard(
                      product: _filtered[i],
                      catName: _catName(_filtered[i]['category_id']),
                      onTap: () => _editProduct(Map<String, dynamic>.from(_filtered[i])),
                      onToggle: () => _toggleActive(_filtered[i]),
                    ),
                  ),
            )),
          ]),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? T.accent : T.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? T.accent : T.border),
          boxShadow: active ? [] : T.softShadow,
        ),
        child: Text(label, style: TextStyle(
          fontSize: 13, fontWeight: FontWeight.w600,
          color: active ? Colors.white : T.muted)),
      ),
    ),
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final String catName;
  final VoidCallback onTap, onToggle;
  const _ProductCard({required this.product, required this.catName,
    required this.onTap, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final p = product;
    final active   = p['is_active'] == true;
    final photoUrl = p['photo_url']?.toString() ?? p['image_url']?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: T.softShadow,
        border: active ? null : Border.all(color: T.danger.withValues(alpha: 0.25)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            // Photo or placeholder
            _PhotoThumb(url: photoUrl),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p['name']?.toString() ?? '—',
                style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600,
                  color: active ? T.text : T.muted,
                  decoration: active ? null : TextDecoration.lineThrough)),
              const SizedBox(height: 3),
              Text('$catName · ${p["unit"] ?? "шт"}',
                style: const TextStyle(color: T.muted, fontSize: 12)),
            ])),
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(_fmt(p['price']),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: T.accent)),
              const SizedBox(height: 4),
              Transform.scale(
                scale: 0.85,
                child: Switch(
                  value: active,
                  activeColor: T.success,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  onChanged: (_) => onToggle(),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _PhotoThumb extends StatelessWidget {
  final String? url;
  const _PhotoThumb({this.url});

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) {
      return const SizedBox(width: 60, height: 60);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 60, height: 60,
        child: Image.network(
          url!,
          fit: BoxFit.cover,
          headers: const {'ngrok-skip-browser-warning': '1'},
          errorBuilder: (_, __, ___) => const SizedBox(width: 60, height: 60),
        ),
      ),
    );
  }
}

// ── Product form bottom sheet ─────────────────────────────────────────────────

class _ProductForm extends StatefulWidget {
  final List<dynamic> categories;
  final Map<String, dynamic>? initial;
  const _ProductForm({required this.categories, this.initial});
  @override
  State<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<_ProductForm> {
  late final TextEditingController _name, _price, _costPrice, _desc;
  String? _catId;
  bool _isActive = true;

  // Photo
  File? _pickedFile;
  List<int>? _pickedBytes;
  String? _pickedName;
  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    final p = widget.initial;
    _name      = TextEditingController(text: p?['name']?.toString() ?? '');
    _price     = TextEditingController(text: p?['price']?.toString() ?? '');
    _costPrice = TextEditingController(text: p?['cost_price']?.toString() ?? '');
    _desc      = TextEditingController(text: p?['description']?.toString() ?? '');
    _catId     = p?['category_id']?.toString();
    _isActive  = p?['is_active'] != false;
  }

  @override
  void dispose() {
    for (final c in [_name, _price, _costPrice, _desc]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final xfile = await _picker.pickImage(source: source, imageQuality: 80, maxWidth: 1024);
      if (xfile == null) return;
      final bytes = await xfile.readAsBytes();
      setState(() {
        _pickedFile  = File(xfile.path);
        _pickedBytes = bytes;
        _pickedName  = xfile.name;
      });
    } catch (_) {}
  }

  void _showPhotoSheet() => showModalBottomSheet(
    context: context,
    backgroundColor: T.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4,
          decoration: BoxDecoration(color: T.border, borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),
        ListTile(
          leading: Container(width: 38, height: 38, alignment: Alignment.center,
            decoration: BoxDecoration(color: T.accent.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.camera_alt_outlined, color: T.accent)),
          title: const Text('Камера', style: TextStyle(fontWeight: FontWeight.w600, color: T.text)),
          onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.camera); },
        ),
        ListTile(
          leading: Container(width: 38, height: 38, alignment: Alignment.center,
            decoration: BoxDecoration(color: T.blueLight.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.photo_library_outlined, color: T.blueLight)),
          title: const Text('Галерея', style: TextStyle(fontWeight: FontWeight.w600, color: T.text)),
          onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.gallery); },
        ),
        if (_pickedFile != null || (widget.initial?['photo_url'] != null))
          ListTile(
            leading: Container(width: 38, height: 38, alignment: Alignment.center,
              decoration: BoxDecoration(color: T.danger.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.delete_outline, color: T.danger)),
            title: const Text('Удалить фото', style: TextStyle(fontWeight: FontWeight.w600, color: T.danger)),
            onTap: () { Navigator.pop(context); setState(() { _pickedFile = null; _pickedBytes = null; }); },
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );

  void _submit() {
    if (_name.text.isEmpty || _price.text.isEmpty) return;
    Navigator.pop(context, {
      'data': {
        'name': _name.text.trim(),
        'price': _price.text.trim(),
        if (_costPrice.text.isNotEmpty) 'cost_price': _costPrice.text.trim(),
        if (_desc.text.isNotEmpty)      'description': _desc.text.trim(),
        if (_catId != null)             'category_id': _catId,
        'is_active': _isActive,
      },
      if (_pickedBytes != null) 'photoBytes': _pickedBytes,
      if (_pickedName  != null) 'photoName':  _pickedName,
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEdit   = widget.initial != null;
    final photoUrl = widget.initial?['photo_url']?.toString()
                  ?? widget.initial?['image_url']?.toString();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      builder: (_, sc) => Container(
        decoration: const BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(children: [
          // Handle
          const SizedBox(height: 10),
          Container(width: 40, height: 4,
            decoration: BoxDecoration(color: T.border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 14),
          // Title row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Text(isEdit ? 'Редактировать блюдо' : 'Новое блюдо',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: T.text)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close, color: T.muted),
                onPressed: () => Navigator.pop(context),
                padding: EdgeInsets.zero, constraints: const BoxConstraints()),
            ]),
          ),
          Divider(height: 1, color: T.border),
          Expanded(child: ListView(
            controller: sc,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            children: [

              // ── Photo picker ─────────────────────────────────────────────
              if (_pickedFile != null)
                GestureDetector(
                  onTap: _showPhotoSheet,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      height: 140, width: double.infinity,
                      child: Stack(fit: StackFit.expand, children: [
                        Image.file(_pickedFile!, fit: BoxFit.cover),
                        Positioned(
                          bottom: 8, right: 8,
                          child: _changeChip()),
                      ]),
                    ),
                  ),
                )
              else if (photoUrl != null && photoUrl.isNotEmpty)
                GestureDetector(
                  onTap: _showPhotoSheet,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      height: 140, width: double.infinity,
                      child: Stack(fit: StackFit.expand, children: [
                        Image.network(
                          photoUrl,
                          fit: BoxFit.cover,
                          headers: const {'ngrok-skip-browser-warning': '1'},
                          errorBuilder: (_, __, ___) => _addPhotoRow(),
                        ),
                        Positioned(
                          bottom: 8, right: 8,
                          child: _changeChip()),
                      ]),
                    ),
                  ),
                )
              else
                GestureDetector(
                  onTap: _showPhotoSheet,
                  child: _addPhotoRow(),
                ),
              const SizedBox(height: 16),

              // ── Fields ───────────────────────────────────────────────────
              TextField(controller: _name, autofocus: !isEdit,
                decoration: const InputDecoration(labelText: 'Название *')),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: TextField(
                  controller: _price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Цена (UZS) *'),
                )),
                const SizedBox(width: 10),
                Expanded(child: TextField(
                  controller: _costPrice,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Себестоимость'),
                )),
              ]),
              const SizedBox(height: 12),
              TextField(controller: _desc, maxLines: 2,
                decoration: const InputDecoration(labelText: 'Описание')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                value: _catId,
                decoration: const InputDecoration(labelText: 'Категория'),
                dropdownColor: T.surface,
                style: const TextStyle(color: T.text, fontSize: 14),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Без категории')),
                  ...widget.categories.map((c) =>
                    DropdownMenuItem(value: c['id']?.toString(), child: Text(c['name']?.toString() ?? ''))),
                ],
                onChanged: (v) => setState(() => _catId = v),
              ),
              const SizedBox(height: 4),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Активно (доступно в заказе)',
                  style: TextStyle(fontSize: 14, color: T.text, fontWeight: FontWeight.w500)),
                value: _isActive,
                activeColor: T.success,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            ],
          )),
          // Save button
          Padding(
            padding: EdgeInsets.fromLTRB(20, 10, 20, MediaQuery.of(context).viewInsets.bottom + 20),
            child: SizedBox(width: double.infinity, height: 52,
              child: ElevatedButton(
                onPressed: _submit,
                child: Text(isEdit ? 'Сохранить' : 'Создать',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              )),
          ),
        ]),
      ),
    );
  }

  Widget _changeChip() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.black54, borderRadius: BorderRadius.circular(8)),
    child: const Text('Изменить',
      style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600)),
  );

  Widget _addPhotoRow() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: T.bg,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: T.border)),
    child: Row(children: [
      const Icon(Icons.add_photo_alternate_outlined, color: T.muted, size: 18),
      const SizedBox(width: 8),
      const Text('Добавить фото', style: TextStyle(color: T.muted, fontSize: 13)),
    ]),
  );
}

String _fmt(dynamic v) {
  final n = num.tryParse(v.toString()) ?? 0;
  return n.toStringAsFixed(0).replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
