import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import 'settings_page.dart';

class WaiterPage extends StatefulWidget {
  const WaiterPage({super.key});
  @override
  State<WaiterPage> createState() => _WaiterPageState();
}

class _WaiterPageState extends State<WaiterPage> {
  List<dynamic> _orders = [];
  List<dynamic> _printerList = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final branchId = context.read<AppState>().branchId;
      final results = await Future.wait([
        Api().orders(branchId: branchId),
        Api().printers(),
      ]);
      if (!mounted) return;
      setState(() {
        _orders = results[0].where((o) =>
          ['new', 'accepted', 'cooking', 'ready'].contains(o['status'])).toList();
        _printerList = results[1];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _printReceipt(Map<String, dynamic> order) async {
    final branchId = context.read<AppState>().branchId;
    final printer = _printerList.cast<Map<String, dynamic>>().where(
      (p) => p['printer_type'] == 'receipt' && p['branch_id'] == branchId,
    ).firstOrNull;
    if (printer == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Принтер чеков не найден')),
        );
      }
      return;
    }
    try {
      await Api().printReceipt(order['id'], printer['id']);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Чек отправлен')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка печати')),
        );
      }
    }
  }

  String _statusLabel(String s) {
    const map = {'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится', 'ready': 'Готов'};
    return map[s] ?? s;
  }

  Color _statusColor(String s) {
    const map = {'new': AppTheme.accentLight, 'accepted': Color(0xFF4ADE80),
                 'cooking': Color(0xFFFB923C), 'ready': Color(0xFF86EFAC)};
    return map[s] ?? AppTheme.textMuted;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Scaffold(
      appBar: AppBar(
        leading: state.isAdmin
          ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: state.backToModes)
          : null,
        title: Text(state.displayName),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage())),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Новый заказ'),
        onPressed: () async {
          final created = await Navigator.push<bool>(
            context, MaterialPageRoute(builder: (_) => const _NewOrderScreen()),
          );
          if (created == true) _load();
        },
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _orders.isEmpty
              ? ListView(children: [
                  SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                  const Center(child: Icon(Icons.restaurant_menu, size: 64, color: AppTheme.border)),
                  const SizedBox(height: 16),
                  const Center(child: Text('Нет активных заказов', style: TextStyle(color: AppTheme.textMuted, fontSize: 16))),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: _orders.length,
                  itemBuilder: (ctx, i) {
                    final o = _orders[i];
                    final items = o['items'] as List? ?? [];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => _showDetail(o),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.accent.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text('#${o['order_number']}',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.accent)),
                              ),
                              if (o['table_number'] != null) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppTheme.surfaceLight,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    const Icon(Icons.table_restaurant, size: 14, color: AppTheme.textMuted),
                                    const SizedBox(width: 4),
                                    Text('${o['table_number']}', style: const TextStyle(fontSize: 13)),
                                  ]),
                                ),
                              ],
                              const Spacer(),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: _statusColor(o['status']).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(_statusLabel(o['status']),
                                  style: TextStyle(color: _statusColor(o['status']), fontSize: 12, fontWeight: FontWeight.w600)),
                              ),
                            ]),
                            const SizedBox(height: 10),
                            ...items.take(3).map((it) => Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Text('${it['name']}  ×${it['quantity']}',
                                style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                            )),
                            if (items.length > 3)
                              Text('+ещё ${items.length - 3}', style: const TextStyle(
                                color: AppTheme.textMuted, fontSize: 13, fontStyle: FontStyle.italic)),
                            const SizedBox(height: 8),
                            Row(children: [
                              Text(_fmt(o['total_amount']),
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                              const Text(' сум', style: TextStyle(color: AppTheme.textMuted, fontSize: 14)),
                              const Spacer(),
                              if (o['status'] == 'ready')
                                const Icon(Icons.check_circle, color: AppTheme.success, size: 22),
                            ]),
                          ]),
                        ),
                      ),
                    );
                  },
                ),
          ),
    );
  }

  void _showDetail(Map<String, dynamic> order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        expand: false,
        builder: (ctx, scrollCtrl) {
          final items = order['items'] as List? ?? [];
          return ListView(
            controller: scrollCtrl,
            padding: const EdgeInsets.all(20),
            children: [
              Center(child: Container(width: 40, height: 4,
                decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 16),
              Text('Заказ #${order['order_number']}',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              if (order['table_number'] != null)
                Text('Стол ${order['table_number']}', style: const TextStyle(color: AppTheme.textMuted)),
              const SizedBox(height: 16),
              ...items.map((it) => Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppTheme.bg, borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  Text('×${it['quantity']}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.accent)),
                  const SizedBox(width: 12),
                  Expanded(child: Text(it['name'], style: const TextStyle(fontSize: 15))),
                  Text('${_fmt(it['total'])} сум', style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                ]),
              )),
              const SizedBox(height: 12),
              Row(children: [
                const Text('Итого', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text('${_fmt(order['total_amount'])} сум',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.accent)),
              ]),
              const SizedBox(height: 20),
              SizedBox(width: double.infinity, child: OutlinedButton.icon(
                icon: const Icon(Icons.print, size: 18),
                label: const Text('Печать чека'),
                onPressed: () { Navigator.pop(ctx); _printReceipt(order); },
              )),
              const SizedBox(height: 12),
            ],
          );
        },
      ),
    );
  }
}

// ── New order screen ─────────────────────────────────────────────────────────

class _NewOrderScreen extends StatefulWidget {
  const _NewOrderScreen();
  @override
  State<_NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends State<_NewOrderScreen> {
  String? _selectedTable;
  List<dynamic> _products = [];
  List<dynamic> _categories = [];
  String? _activeCat;
  String _search = '';
  final Map<String, _CartItem> _cart = {};
  bool _submitting = false;
  bool _loadingCatalog = true;

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  Future<void> _loadCatalog() async {
    try {
      final results = await Future.wait([Api().products(), Api().categories()]);
      if (!mounted) return;
      setState(() {
        _products = results[0].where((p) => p['is_active'] == true && p['is_available'] == true).toList();
        _categories = results[1];
        _loadingCatalog = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCatalog = false);
    }
  }

  List<dynamic> get _filtered => _products.where((p) {
    if (_activeCat != null && p['category_id'] != _activeCat) return false;
    if (_search.isNotEmpty && !(p['name'] as String).toLowerCase().contains(_search.toLowerCase())) return false;
    return true;
  }).toList();

  double get _total => _cart.values.fold(0, (s, c) => s + c.price * c.qty);
  int get _totalItems => _cart.values.fold(0, (s, c) => s + c.qty);

  void _addToCart(Map<String, dynamic> product) {
    final id = product['id'] as String;
    setState(() {
      if (_cart.containsKey(id)) {
        _cart[id]!.qty++;
      } else {
        _cart[id] = _CartItem(
          id: id,
          name: product['name'],
          price: double.tryParse(product['price'].toString()) ?? 0,
          qty: 1,
        );
      }
    });
  }

  void _changeQty(String id, int delta) {
    setState(() {
      final item = _cart[id]!;
      item.qty += delta;
      if (item.qty <= 0) _cart.remove(id);
    });
  }

  Future<void> _submit() async {
    if (_cart.isEmpty) return;
    setState(() => _submitting = true);
    try {
      final branchId = context.read<AppState>().branchId;
      await Api().createOrder({
        'branch_id': branchId,
        'order_type': 'dine_in',
        'table_number': _selectedTable,
        'items': _cart.values.map((c) => {'product_id': c.id, 'quantity': c.qty}).toList(),
      });
      if (mounted) {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ошибка создания заказа')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showTablePicker() async {
    final branchId = context.read<AppState>().branchId;
    List<dynamic> tables = [];
    try {
      tables = await Api().branchTables(branchId);
    } catch (_) {}

    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setLocal) => Container(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Center(child: Container(width: 40, height: 4,
              decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text('Выберите стол', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            tables.isEmpty
              ? Column(children: [
                  const Icon(Icons.table_restaurant, size: 48, color: AppTheme.textMuted),
                  const SizedBox(height: 8),
                  const Text('Нет доступных столов', style: TextStyle(color: AppTheme.textMuted)),
                  const Text('Настройте залы и столы в админ-панели',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                ])
              : Flexible(child: GridView.builder(
                  shrinkWrap: true,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 5, mainAxisSpacing: 8, crossAxisSpacing: 8,
                  ),
                  itemCount: tables.length,
                  itemBuilder: (ctx2, i) {
                    final t = tables[i];
                    final num = '${t['number']}';
                    final selected = _selectedTable == num;
                    return GestureDetector(
                      onTap: () {
                        setState(() => _selectedTable = num);
                        Navigator.pop(ctx);
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: selected ? AppTheme.accent : AppTheme.surfaceLight,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: selected ? AppTheme.accent : AppTheme.border),
                        ),
                        alignment: Alignment.center,
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(num, style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold,
                            color: selected ? Colors.white : AppTheme.textColor,
                          )),
                          if (t['capacity'] != null)
                            Text('${t['capacity']}м', style: TextStyle(
                              fontSize: 10,
                              color: selected ? Colors.white70 : AppTheme.textMuted,
                            )),
                        ]),
                      ),
                    );
                  },
                )),
            const SizedBox(height: 12),
            SizedBox(width: double.infinity, child: OutlinedButton(
              onPressed: () { setState(() => _selectedTable = null); Navigator.pop(ctx); },
              child: const Text('Без стола (на вынос)'),
            )),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Новый заказ'),
        actions: [
          if (_cart.isNotEmpty) Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppTheme.accent, borderRadius: BorderRadius.circular(12)),
              child: Text('$_totalItems', style: const TextStyle(fontWeight: FontWeight.bold)),
            )),
          ),
        ],
      ),
      body: _loadingCatalog
        ? const Center(child: CircularProgressIndicator())
        : Column(children: [
            // Table selector + search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Row(children: [
                GestureDetector(
                  onTap: _showTablePicker,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: _selectedTable != null ? AppTheme.accent.withValues(alpha: 0.15) : AppTheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _selectedTable != null ? AppTheme.accent : AppTheme.border),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.table_restaurant, size: 18,
                        color: _selectedTable != null ? AppTheme.accent : AppTheme.textMuted),
                      const SizedBox(width: 6),
                      Text(_selectedTable != null ? 'Стол $_selectedTable' : 'Стол',
                        style: TextStyle(color: _selectedTable != null ? AppTheme.accent : AppTheme.textMuted,
                          fontWeight: FontWeight.w500)),
                    ]),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'Поиск блюда...',
                    prefixIcon: Icon(Icons.search, size: 20),
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(vertical: 10),
                  ),
                  onChanged: (v) => setState(() => _search = v),
                )),
              ]),
            ),
            // Categories
            if (_categories.isNotEmpty) SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                children: [
                  Padding(padding: const EdgeInsets.only(right: 6), child: FilterChip(
                    label: const Text('Все'), selected: _activeCat == null,
                    onSelected: (_) => setState(() => _activeCat = null),
                  )),
                  ..._categories.map((c) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(c['name']), selected: _activeCat == c['id'],
                      onSelected: (_) => setState(() => _activeCat = _activeCat == c['id'] ? null : c['id']),
                    ),
                  )),
                ],
              ),
            ),
            // Products grid
            Expanded(
              child: _filtered.isEmpty
                ? const Center(child: Text('Ничего не найдено', style: TextStyle(color: AppTheme.textMuted)))
                : GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: MediaQuery.of(context).size.width > 600 ? 4 : 2,
                      mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.4,
                    ),
                    itemCount: _filtered.length,
                    itemBuilder: (ctx, i) {
                      final p = _filtered[i];
                      final inCart = _cart.containsKey(p['id']);
                      return GestureDetector(
                        onTap: () => _addToCart(Map<String, dynamic>.from(p)),
                        child: Container(
                          decoration: BoxDecoration(
                            color: inCart ? AppTheme.accent.withValues(alpha: 0.1) : AppTheme.surface,
                            border: Border.all(color: inCart ? AppTheme.accent : AppTheme.border, width: inCart ? 1.5 : 0.5),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                            Text(p['name'], maxLines: 2, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, height: 1.2)),
                            Row(children: [
                              Text(_fmt(p['price']),
                                style: const TextStyle(color: AppTheme.accent, fontSize: 14, fontWeight: FontWeight.w700)),
                              const Spacer(),
                              if (inCart) Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(color: AppTheme.accent, borderRadius: BorderRadius.circular(8)),
                                child: Text('${_cart[p['id']]!.qty}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              ),
                            ]),
                          ]),
                        ),
                      );
                    },
                  ),
            ),
            // Cart panel
            if (_cart.isNotEmpty) Container(
              decoration: const BoxDecoration(
                color: AppTheme.surface,
                border: Border(top: BorderSide(color: AppTheme.border)),
              ),
              child: SafeArea(
                top: false,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 160),
                    child: ListView(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      children: _cart.values.map((c) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          Expanded(child: Text(c.name, style: const TextStyle(fontSize: 14))),
                          GestureDetector(
                            onTap: () => _changeQty(c.id, -1),
                            child: Container(
                              width: 30, height: 30, alignment: Alignment.center,
                              decoration: BoxDecoration(color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
                              child: const Icon(Icons.remove, size: 16),
                            ),
                          ),
                          SizedBox(width: 32, child: Text('${c.qty}',
                            textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold))),
                          GestureDetector(
                            onTap: () => _changeQty(c.id, 1),
                            child: Container(
                              width: 30, height: 30, alignment: Alignment.center,
                              decoration: BoxDecoration(color: AppTheme.bg, borderRadius: BorderRadius.circular(8)),
                              child: const Icon(Icons.add, size: 16),
                            ),
                          ),
                          SizedBox(width: 80, child: Text(_fmt(c.price * c.qty),
                            textAlign: TextAlign.right, style: const TextStyle(color: AppTheme.textMuted, fontSize: 13))),
                        ]),
                      )).toList(),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(width: double.infinity, child: ElevatedButton(
                      onPressed: _submitting ? null : _submit,
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                      child: _submitting
                        ? const SizedBox(height: 20, width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Создать — ${_fmt(_total)} сум',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    )),
                  ),
                ]),
              ),
            ),
          ]),
    );
  }
}

class _CartItem {
  final String id;
  final String name;
  final double price;
  int qty;
  _CartItem({required this.id, required this.name, required this.price, required this.qty});
}

String _fmt(dynamic v) {
  final n = v is num ? v : (num.tryParse(v.toString()) ?? 0);
  return n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
