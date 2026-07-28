import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

enum _Step { table, menu }

// ── Cart item model ────────────────────────────────────────────────────────────

class _CartItem {
  final String id;
  final String name;
  final double basePrice;
  int qty = 1;
  String priceText; // user-editable, may differ from basePrice
  String note;

  _CartItem({
    required this.id,
    required this.name,
    required this.basePrice,
  })  : priceText = basePrice.toStringAsFixed(0),
        note = '';

  double get effectivePrice => double.tryParse(priceText) ?? basePrice;
  double get lineTotal => effectivePrice * qty;
}

// ── Page ───────────────────────────────────────────────────────────────────────

class NewOrderPage extends StatefulWidget {
  const NewOrderPage({super.key});
  @override
  State<NewOrderPage> createState() => _NewOrderPageState();
}

class _NewOrderPageState extends State<NewOrderPage> {
  _Step _step = _Step.table;
  String? _selectedTable;

  List<dynamic> _tables    = [];
  bool _loadingTables      = true;
  Map<String, List<Map<String, dynamic>>> _tableOrders = {};

  List<dynamic> _products  = [];
  List<dynamic> _categories = [];
  String? _activeCat;
  String _search           = '';
  bool _loadingCatalog     = false;

  final Map<String, _CartItem> _cart = {};

  @override
  void initState() {
    super.initState();
    _loadTables();
  }

  Future<void> _loadTables() async {
    try {
      final branchId = context.read<AppState>().branchId;
      final results  = await Future.wait([
        Api().branchTables(branchId),
        Api().orders(branchId: branchId, activeOnly: true),
      ]);
      const active = {'new', 'accepted', 'cooking', 'ready'};
      final map = <String, List<Map<String, dynamic>>>{};
      for (final o in results[1]) {
        final num = o['table_number'] as String?;
        if (num != null && active.contains(o['status'] as String)) {
          map.putIfAbsent(num, () => []).add(Map<String, dynamic>.from(o as Map));
        }
      }
      if (mounted) {
        setState(() {
          _tables      = results[0];
          _tableOrders = map;
          _loadingTables = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingTables = false);
    }
  }

  Future<void> _loadCatalog() async {
    try {
      final results = await Future.wait([Api().products(), Api().categories()]);
      if (!mounted) return;
      setState(() {
        _products = results[0]
            .where((p) => p['is_active'] == true && p['is_available'] == true)
            .toList();
        _categories    = results[1];
        _loadingCatalog = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCatalog = false);
    }
  }

  void _selectTable(String? tableNum) {
    setState(() {
      _selectedTable  = tableNum;
      _step           = _Step.menu;
      _loadingCatalog = true;
    });
    _loadCatalog();
  }

  List<dynamic> get _filtered => _products.where((p) {
    if (_activeCat != null && p['category_id'] != _activeCat) return false;
    if (_search.isNotEmpty &&
        !(p['name'] as String).toLowerCase().contains(_search.toLowerCase())) {
      return false;
    }
    return true;
  }).toList();

  static int _tableCols(double w) {
    if (w >= 600) return 6;
    if (w >= 400) return 5;
    return 4;
  }

  int    get _cartCount => _cart.values.fold(0, (s, c) => s + c.qty);
  double get _cartTotal => _cart.values.fold(0.0, (s, c) => s + c.lineTotal);

  void _addToCart(Map<String, dynamic> product) {
    final id = product['id'] as String;
    setState(() {
      if (_cart.containsKey(id)) {
        _cart[id]!.qty++;
      } else {
        _cart[id] = _CartItem(
          id:        id,
          name:      product['name'] as String,
          basePrice: toDouble(product['price']),
        );
      }
    });
  }

  Future<void> _submit() async {
    if (_cart.isEmpty) return;
    try {
      final branchId = context.read<AppState>().branchId;
      await Api().createOrder({
        'branch_id':  branchId,
        'order_type': _selectedTable != null ? 'dine_in' : 'takeaway',
        if (_selectedTable != null) 'table_number': _selectedTable,
        'items': _cart.values.map((c) => {
          'product_id': c.id,
          'quantity':   c.qty,
          'price':      c.effectivePrice,
          if (c.note.isNotEmpty) 'note': c.note,
        }).toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) showSnack(context, 'Ошибка создания заказа', error: true);
    }
  }

  void _openCart() {
    showModalBottomSheet(
      context:           context,
      isScrollControlled: true,
      backgroundColor:   AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _CartSheet(
        cart:        _cart,
        onRemove:    (id) => setState(() => _cart.remove(id)),
        onQtyChange: (id, delta) => setState(() {
          if (!_cart.containsKey(id)) return;
          _cart[id]!.qty += delta;
          if (_cart[id]!.qty <= 0) _cart.remove(id);
        }),
        onSubmit: _submit,
      ),
    ).whenComplete(() => setState(() {}));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == _Step.table,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          setState(() { _step = _Step.table; _search = ''; _activeCat = null; });
        }
      },
      child: Scaffold(
      appBar: AppBar(
        leading: _step == _Step.menu
          ? IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => setState(() {
                _step = _Step.table; _search = ''; _activeCat = null; }))
          : null,
        title: _step == _Step.table
          ? const Text('Новый заказ')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
              const Text('Новый заказ',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              Text(
                _selectedTable != null
                  ? 'Стол $_selectedTable' : 'На вынос',
                style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ]),
        actions: [
          if (_step == _Step.menu && _cartCount > 0)
            Stack(alignment: Alignment.topRight, children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                onPressed: _openCart),
              Positioned(
                right: 6, top: 6,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (child, anim) =>
                    ScaleTransition(scale: anim, child: child),
                  child: Container(
                    key: ValueKey(_cartCount),
                    width: 18, height: 18,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppTheme.accent, shape: BoxShape.circle),
                    child: Text('$_cartCount',
                      style: const TextStyle(
                        fontSize: 10, fontWeight: FontWeight.bold,
                        color: Colors.white)),
                  ),
                ),
              ),
            ]),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        transitionBuilder: (child, animation) {
          final slide = Tween<Offset>(begin: const Offset(0.06, 0), end: Offset.zero)
              .animate(CurvedAnimation(parent: animation, curve: Curves.easeOut));
          return FadeTransition(opacity: animation,
            child: SlideTransition(position: slide, child: child));
        },
        child: _step == _Step.table
          ? KeyedSubtree(key: const ValueKey('table'), child: _buildTableStep())
          : KeyedSubtree(key: const ValueKey('menu'), child: _buildMenuStep()),
      ),
      bottomNavigationBar: _step == _Step.menu
        ? AnimatedSize(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            child: _cart.isNotEmpty ? _buildCartBar() : const SizedBox.shrink(),
          )
        : null,
      ),
    );
  }

  // ── Step 1 — table ─────────────────────────────────────────────────────────

  Widget _buildTableStep() {
    if (_loadingTables) return const LoadingCenter();
    final occupiedCount = _tableOrders.length;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Row(children: [
          const Text('Выберите стол',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const Spacer(),
          if (occupiedCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8)),
              child: Text('$occupiedCount заняты',
                style: const TextStyle(
                  fontSize: 12, color: AppTheme.warning,
                  fontWeight: FontWeight.w600))),
        ]),
      ),
      Expanded(
        child: _tables.isEmpty
          ? const EmptyState(
              icon: Icons.table_restaurant,
              message: 'Нет доступных столов')
          : RefreshIndicator(
              onRefresh: _loadTables,
              child: GridView.builder(
                padding: EdgeInsets.fromLTRB(
                  16, 0, 16, MediaQuery.of(context).padding.bottom + 16),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: _tableCols(MediaQuery.of(context).size.width),
                  mainAxisSpacing: 10, crossAxisSpacing: 10,
                  childAspectRatio: 0.75),
                itemCount: _tables.length,
                itemBuilder: (ctx, i) {
                  final t      = _tables[i];
                  final num    = '${t['number']}';
                  final bills  = _tableOrders[num] ?? [];
                  final total  = bills.fold<double>(
                    0, (s, o) => s + toDouble(o['total_amount']));
                  final busy   = bills.isNotEmpty;
                  return GestureDetector(
                    onTap: () => busy
                      ? _showTableOptions(num, bills)
                      : _selectTable(num),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      decoration: BoxDecoration(
                        color: busy
                          ? AppTheme.accent.withValues(alpha: 0.10)
                          : AppTheme.surfaceLight,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: busy ? AppTheme.accent : AppTheme.border,
                          width: busy ? 1.5 : 0.5)),
                      padding: const EdgeInsets.all(6),
                      alignment: Alignment.center,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.table_restaurant,
                          size: 22,
                          color: busy ? AppTheme.accent : AppTheme.textMuted),
                        const SizedBox(height: 2),
                        Text(num, style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.bold)),
                        if (!busy && t['hall_name'] != null)
                          Text('${t['hall_name']}',
                            style: const TextStyle(
                              fontSize: 9, color: AppTheme.textMuted)),
                        if (busy) ...[
                          const SizedBox(height: 4),
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.accent,
                                borderRadius: BorderRadius.circular(4)),
                              child: Text(
                                '${bills.length}',
                                style: const TextStyle(
                                  fontSize: 9, color: Colors.white,
                                  fontWeight: FontWeight.bold))),
                            const SizedBox(width: 4),
                            Flexible(child: Text(
                              fmtNum(total),
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 9, color: AppTheme.accent,
                                fontWeight: FontWeight.w600))),
                          ]),
                        ] else if (t['capacity'] != null)
                          Text('${t['capacity']} м.',
                            style: const TextStyle(
                              fontSize: 10, color: AppTheme.textMuted)),
                      ]),
                    ),
                  );
                },
              ),
            ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: SizedBox(width: double.infinity, child: OutlinedButton.icon(
            icon: const Icon(Icons.takeout_dining, size: 18),
            label: const Text('Без стола (на вынос)'),
            onPressed: () => _selectTable(null),
          )),
        ),
      ),
    ]);
  }

  void _showTableOptions(String tableNum, List<Map<String, dynamic>> bills) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (bCtx) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const DragHandle(),
            Row(children: [
              const Icon(Icons.table_restaurant, color: AppTheme.accent, size: 22),
              const SizedBox(width: 10),
              Text('Стол $tableNum',
                style: const TextStyle(
                  fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8)),
                child: Text(
                  '${bills.length} активн.',
                  style: const TextStyle(
                    fontSize: 12, color: AppTheme.warning,
                    fontWeight: FontWeight.w600))),
            ]),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, child: ElevatedButton.icon(
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Открыть новый счёт'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accent,
                padding: const EdgeInsets.symmetric(vertical: 12)),
              onPressed: () {
                Navigator.pop(bCtx);
                _selectTable(tableNum);
              },
            )),
            const SizedBox(height: 16),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Активные счета',
                style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted))),
            const SizedBox(height: 8),
            ...bills.map((o) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.bg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.border, width: 0.5)),
              child: Row(children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('#${o['order_number']}',
                    style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.bold)),
                  Text(
                    '${(o['items'] as List? ?? []).length} поз.',
                    style: const TextStyle(
                      color: AppTheme.textMuted, fontSize: 12)),
                ]),
                const Spacer(),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('${fmtNum(o['total_amount'])} сум',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  StatusBadge(o['status'] as String),
                ]),
              ]),
            )),
          ]),
        ),
      ),
    );
  }

  // ── Step 2 — menu ──────────────────────────────────────────────────────────

  Widget _buildMenuStep() {
    if (_loadingCatalog) return const LoadingCenter();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: TextField(
          decoration: const InputDecoration(
            hintText: 'Поиск блюда...',
            prefixIcon: Icon(Icons.search, size: 20),
            isDense: true,
            contentPadding: EdgeInsets.symmetric(vertical: 10),
          ),
          onChanged: (v) => setState(() => _search = v),
        ),
      ),
      if (_categories.isNotEmpty) SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: const Text('Все'),
                selected: _activeCat == null,
                onSelected: (_) => setState(() => _activeCat = null),
              )),
            ..._categories.map((c) => Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(c['name'] as String),
                selected: _activeCat == c['id'],
                onSelected: (_) => setState(() =>
                  _activeCat = _activeCat == c['id'] ? null : c['id']),
              ),
            )),
          ],
        ),
      ),
      Expanded(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (d) => _swipeCategory(d.primaryVelocity ?? 0),
          child: _filtered.isEmpty
            ? const EmptyState(icon: Icons.search_off, message: 'Ничего не найдено')
            : GridView.builder(
                padding: EdgeInsets.fromLTRB(12, 8, 12,
                  MediaQuery.of(context).padding.bottom + (_cart.isNotEmpty ? 80 : 12)),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: responsiveCols(MediaQuery.of(context).size.width),
                  mainAxisSpacing: 8, crossAxisSpacing: 8,
                  childAspectRatio: 1.4),
                itemCount: _filtered.length,
                itemBuilder: (ctx, i) {
                  final p      = _filtered[i];
                  final id     = p['id'] as String;
                  final inCart = _cart.containsKey(id);
                  final qty    = inCart ? _cart[id]!.qty : 0;
                  final photoUrl = p['image_url']?.toString();
                  return GestureDetector(
                    onTap: inCart ? null
                      : () => _addToCart(Map<String, dynamic>.from(p as Map)),
                    onLongPress: () =>
                      _showQuickAdd(Map<String, dynamic>.from(p as Map)),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOut,
                      decoration: BoxDecoration(
                        color: inCart
                          ? AppTheme.accent.withValues(alpha: 0.1)
                          : AppTheme.surface,
                        border: Border.all(
                          color: inCart ? AppTheme.accent : AppTheme.border,
                          width: inCart ? 1.5 : 0.5),
                        borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                        if (photoUrl != null && photoUrl.isNotEmpty)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: SizedBox(
                                  width: double.infinity,
                                  child: Image.network(
                                    photoUrl,
                                    fit: BoxFit.cover,
                                    headers: const {'ngrok-skip-browser-warning': '1'},
                                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        Text(p['name'] as String,
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w500, height: 1.2)),
                        if (!inCart)
                          Text(fmtNum(p['price']),
                            style: const TextStyle(
                              color: AppTheme.accent, fontSize: 14,
                              fontWeight: FontWeight.w700))
                        else
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                            Text(fmtNum(p['price']),
                              style: const TextStyle(
                                color: AppTheme.accent, fontSize: 11,
                                fontWeight: FontWeight.w700)),
                            Row(mainAxisSize: MainAxisSize.min, children: [
                              _miniBtn(Icons.remove, () => setState(() {
                                if (_cart[id]!.qty > 1) { _cart[id]!.qty--; }
                                else { _cart.remove(id); }
                              })),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 5),
                                child: Text('$qty', style: const TextStyle(
                                  fontWeight: FontWeight.bold, fontSize: 13,
                                  color: AppTheme.accent))),
                              _miniBtn(Icons.add, () => setState(() =>
                                _cart[id]!.qty++)),
                            ]),
                          ]),
                      ]),
                    ),
                  );
                },
              ),
        ),
      ),
    ]);
  }

  void _swipeCategory(double vx) {
    if (_categories.isEmpty || vx.abs() < 300) return;
    final cats = <String?>[null, ..._categories.map((c) => c['id'] as String?)];
    final idx  = cats.indexOf(_activeCat);
    if (vx < 0 && idx < cats.length - 1) {
      setState(() => _activeCat = cats[idx + 1]);
    } else if (vx > 0 && idx > 0) {
      setState(() => _activeCat = cats[idx - 1]);
    }
  }

  Widget _miniBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 24, height: 24,
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppTheme.border)),
      alignment: Alignment.center,
      child: Icon(icon, size: 14, color: AppTheme.accent),
    ),
  );

  void _showQuickAdd(Map<String, dynamic> product) {
    final id = product['id'] as String;
    showModalBottomSheet(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _QuickAddSheet(
        product:  product,
        existing: _cart[id],
        onConfirm: (qty, priceText, note) {
          setState(() {
            if (_cart.containsKey(id)) {
              _cart[id]!.qty  = qty;
              if (priceText.isNotEmpty) _cart[id]!.priceText = priceText;
              _cart[id]!.note = note;
            } else {
              final item = _CartItem(
                id:        id,
                name:      product['name'] as String,
                basePrice: toDouble(product['price']));
              item.qty  = qty;
              if (priceText.isNotEmpty) item.priceText = priceText;
              item.note = note;
              _cart[id] = item;
            }
          });
        },
      ),
    );
  }

  Widget _buildCartBar() => GestureDetector(
    onTap: _openCart,
    child: Container(
      color: AppTheme.accent,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(8)),
              child: Text('$_cartCount поз.',
                style: const TextStyle(
                  fontWeight: FontWeight.bold, color: Colors.white))),
            const SizedBox(width: 12),
            const Text('Открыть корзину',
              style: TextStyle(
                fontSize: 15, fontWeight: FontWeight.w500, color: Colors.white)),
            const Spacer(),
            Text('${fmtNum(_cartTotal)} сум',
              style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
          ]),
        ),
      ),
    ),
  );
}

// ── Cart bottom sheet ──────────────────────────────────────────────────────────

class _CartSheet extends StatefulWidget {
  final Map<String, _CartItem> cart;
  final void Function(String id) onRemove;
  final void Function(String id, int delta) onQtyChange;
  final Future<void> Function() onSubmit;

  const _CartSheet({
    required this.cart,
    required this.onRemove,
    required this.onQtyChange,
    required this.onSubmit,
  });

  @override
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  final Map<String, TextEditingController> _priceCtrl = {};
  final Map<String, TextEditingController> _noteCtrl  = {};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    for (final e in widget.cart.entries) {
      _initCtrl(e.key, e.value);
    }
  }

  void _initCtrl(String id, _CartItem item) {
    if (_priceCtrl.containsKey(id)) return;

    final pc = TextEditingController(text: item.priceText);
    pc.addListener(() {
      item.priceText = pc.text;
      if (mounted) setState(() {}); // refresh line totals live
    });
    _priceCtrl[id] = pc;

    final nc = TextEditingController(text: item.note);
    nc.addListener(() => item.note = nc.text);
    _noteCtrl[id] = nc;
  }

  void _disposeCtrl(String id) {
    _priceCtrl.remove(id)?.dispose();
    _noteCtrl.remove(id)?.dispose();
  }

  @override
  void dispose() {
    for (final c in _priceCtrl.values) { c.dispose(); }
    for (final c in _noteCtrl.values) { c.dispose(); }
    super.dispose();
  }

  double get _total => widget.cart.values.fold(0.0, (s, c) => s + c.lineTotal);

  @override
  Widget build(BuildContext context) {
    final items = widget.cart.values.toList();
    // ensure controllers exist for all current cart items
    for (final item in items) {
      _initCtrl(item.id, item);
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize:     0.95,
      minChildSize:     0.4,
      expand:           false,
      builder: (_, scrollCtrl) => Column(children: [
        const DragHandle(),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          child: Row(children: [
            const Text('Корзина',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const Spacer(),
            if (items.isNotEmpty)
              Text('${items.length} поз.',
                style: const TextStyle(color: AppTheme.textMuted)),
          ]),
        ),
        Expanded(
          child: items.isEmpty
            ? const EmptyState(
                icon: Icons.shopping_cart_outlined, message: 'Корзина пуста')
            : ListView.builder(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                itemCount: items.length,
                itemBuilder: (ctx, i) => _buildItem(items[i]),
              ),
        ),
        if (items.isNotEmpty) _buildFooter(context),
      ]),
    );
  }

  Widget _buildItem(_CartItem item) {
    final id = item.id;
    return Dismissible(
      key: ValueKey('cart_$id'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          color: AppTheme.danger, borderRadius: BorderRadius.circular(16)),
        child: const Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.delete_outline, color: Colors.white, size: 28),
          SizedBox(height: 4),
          Text('Удалить', style: TextStyle(
            color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ]),
      ),
      onDismissed: (_) {
        widget.onRemove(id);
        _disposeCtrl(id);
        setState(() {});
      },
      child: Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // ── Name row ──────────────────────────────────────────────────────
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(item.name,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () {
                widget.onRemove(id);
                _disposeCtrl(id);
                setState(() {});
              },
              child: const Padding(
                padding: EdgeInsets.all(2),
                child: Icon(Icons.close, size: 20, color: AppTheme.textMuted)),
            ),
          ]),
          const SizedBox(height: 10),

          // ── Qty + price + line total ───────────────────────────────────────
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            // Qty control
            Container(
              decoration: BoxDecoration(
                color: AppTheme.bg, borderRadius: BorderRadius.circular(10)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                _qtyBtn(Icons.remove, () {
                  widget.onQtyChange(id, -1);
                  if (!widget.cart.containsKey(id)) _disposeCtrl(id);
                  setState(() {});
                }),
                SizedBox(width: 40, child: Text('${item.qty}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold))),
                _qtyBtn(Icons.add, () {
                  widget.onQtyChange(id, 1);
                  setState(() {});
                }),
              ]),
            ),
            const SizedBox(width: 10),

            // Editable price
            Expanded(
              child: TextField(
                controller: _priceCtrl[id],
                keyboardType: TextInputType.number,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                decoration: InputDecoration(
                  labelText: 'Цена',
                  suffixText: 'сум',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 8),
                  helperText: item.effectivePrice != item.basePrice
                    ? 'меню: ${fmtNum(item.basePrice)}'
                    : null,
                  helperStyle: const TextStyle(
                    fontSize: 10, color: AppTheme.warning),
                ),
              ),
            ),
            const SizedBox(width: 10),

            // Line total (updates live with price)
            Text(fmtNum(item.lineTotal),
              style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.w600,
                color: AppTheme.accent)),
          ]),
          const SizedBox(height: 10),

          // ── Note for kitchen ──────────────────────────────────────────────
          TextField(
            controller: _noteCtrl[id],
            maxLines: 1,
            style: const TextStyle(fontSize: 13),
            decoration: const InputDecoration(
              hintText: 'Заметка для повара (без лука, пол-порции, на 50 000 сум)...',
              prefixIcon: Icon(Icons.edit_note, size: 18, color: AppTheme.textMuted),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          ),
        ]),
      ),
      ),
    );
  }

  Widget _buildFooter(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
    decoration: const BoxDecoration(
      border: Border(top: BorderSide(color: AppTheme.border))),
    child: SafeArea(
      top: false,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          const Text('Итого',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const Spacer(),
          Text('${fmtNum(_total)} сум',
            style: const TextStyle(
              fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.accent)),
        ]),
        const SizedBox(height: 12),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: _submitting ? null : () async {
            setState(() => _submitting = true);
            await widget.onSubmit();
            if (mounted) setState(() => _submitting = false);
          },
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16)),
          child: _submitting
            ? const SizedBox(
                height: 20, width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2, color: Colors.white))
            : Text('Оформить заказ — ${fmtNum(_total)} сум',
                style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.bold)),
        )),
        const SizedBox(height: 4),
      ]),
    ),
  );

  Widget _qtyBtn(IconData icon, VoidCallback fn) => GestureDetector(
    onTap: fn,
    child: Container(
      width: 36, height: 36, alignment: Alignment.center,
      child: Icon(icon, size: 20)),
  );
}

// ── Quick-add bottom sheet (long-press on product card) ───────────────────────

class _QuickAddSheet extends StatefulWidget {
  final Map<String, dynamic> product;
  final _CartItem? existing;
  final void Function(int qty, String priceText, String note) onConfirm;

  const _QuickAddSheet({
    required this.product,
    this.existing,
    required this.onConfirm,
  });

  @override
  State<_QuickAddSheet> createState() => _QuickAddSheetState();
}

class _QuickAddSheetState extends State<_QuickAddSheet> {
  late int _qty;
  late final TextEditingController _priceCtrl;
  late final TextEditingController _noteCtrl;

  @override
  void initState() {
    super.initState();
    _qty      = widget.existing?.qty ?? 1;
    _priceCtrl = TextEditingController(
      text: widget.existing?.priceText ??
            toDouble(widget.product['price']).toStringAsFixed(0));
    _noteCtrl  = TextEditingController(text: widget.existing?.note ?? '');
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  double get _basePrice      => toDouble(widget.product['price']);
  double get _effectivePrice => double.tryParse(_priceCtrl.text) ?? _basePrice;
  double get _total          => _effectivePrice * _qty;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Container(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const DragHandle(),

          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
              Text(widget.product['name'] as String,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              if ((widget.product['description'] as String?)?.isNotEmpty == true)
                Text(widget.product['description'] as String,
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
            ])),
            const SizedBox(width: 12),
            Text('${fmtNum(_basePrice)} сум',
              style: const TextStyle(
                color: AppTheme.accent, fontSize: 15, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 20),

          // Qty stepper
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _bigBtn(Icons.remove, () { if (_qty > 1) setState(() => _qty--); }),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 150),
              transitionBuilder: (child, anim) =>
                ScaleTransition(scale: anim, child: child),
              child: Padding(
                key: ValueKey(_qty),
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Text('$_qty',
                  style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold))),
            ),
            _bigBtn(Icons.add, () => setState(() => _qty++)),
          ]),
          const SizedBox(height: 18),

          // Custom price
          TextField(
            controller: _priceCtrl,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Цена за единицу',
              suffixText: 'сум',
              helperText: _effectivePrice != _basePrice
                ? 'Цена меню: ${fmtNum(_basePrice)}'
                : null,
              helperStyle: const TextStyle(color: AppTheme.warning, fontSize: 11),
            ),
          ),
          const SizedBox(height: 10),

          // Kitchen note
          TextField(
            controller: _noteCtrl,
            decoration: const InputDecoration(
              labelText: 'Заметка для повара',
              hintText: 'Без лука, пол-порции...',
              prefixIcon: Icon(Icons.edit_note, size: 20, color: AppTheme.textMuted),
              isDense: true,
            ),
          ),
          const SizedBox(height: 20),

          // Total + confirm
          Row(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Итого',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
              Text('${fmtNum(_total)} сум', style: const TextStyle(
                fontSize: 17, fontWeight: FontWeight.bold, color: AppTheme.accent)),
            ]),
            const Spacer(),
            ElevatedButton.icon(
              icon: const Icon(Icons.add_shopping_cart, size: 18),
              label: Text(widget.existing != null ? 'Обновить' : 'В корзину'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accent,
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12)),
              onPressed: () {
                Navigator.pop(context);
                widget.onConfirm(_qty, _priceCtrl.text, _noteCtrl.text);
              },
            ),
          ]),
        ]),
        ),
      ),
    );
  }

  Widget _bigBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 50, height: 50,
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border)),
      alignment: Alignment.center,
      child: Icon(icon, size: 26, color: AppTheme.textColor),
    ),
  );
}
