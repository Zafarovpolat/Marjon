import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import 'cart.dart';
import 'dish_sheet.dart';

/// What the builder hands to [OrderBuilderScreen.onSubmit].
class BuiltOrder {
  BuiltOrder({required this.lines, required this.note, required this.guests, required this.phone, required this.address, required this.customerId});
  final List<CartLine> lines;
  final String note;
  final int guests;
  final String phone; // 9 local digits
  final String address;
  final String? customerId;
}

/// Menu + cart. Used by the cashier (dine-in / take-away / delivery / courier) and
/// the waiter; port of the desktop "order" view.
class OrderBuilderScreen extends StatefulWidget {
  const OrderBuilderScreen({
    super.key,
    required this.title,
    required this.submitLabel,
    required this.onSubmit,
    this.orderType = 'dine_in',
    this.courier = false,
    this.showGuests = false,
    this.canTakeaway = true,
    this.canDeleteLines = true,
  });

  final String title;
  final String submitLabel;
  final String orderType;
  final bool courier;
  final bool showGuests;
  final bool canTakeaway;
  final bool canDeleteLines;
  final Future<void> Function(BuiltOrder order) onSubmit;

  @override
  State<OrderBuilderScreen> createState() => _OrderBuilderScreenState();
}

class _OrderBuilderScreenState extends State<OrderBuilderScreen> {
  final _cart = Cart();
  final _note = TextEditingController();
  final _search = TextEditingController();
  final _phone = TextEditingController(text: '+998');
  final _address = TextEditingController();
  int _guests = 1;
  String? _cat;
  String? _customerId;
  List<Json> _products = [];
  List<Json> _categories = [];
  List<Json> _matches = [];
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadMenu();
  }

  @override
  void dispose() {
    _note.dispose();
    _search.dispose();
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _loadMenu() async {
    try {
      final r = await Future.wait([Api.i.products(), Api.i.categories()]);
      if (!mounted) return;
      setState(() {
        _products = asJsonList(r[0]).where((p) => p['is_active'] != false).toList();
        _categories = asJsonList(r[1]);
      });
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<Json> get _filtered {
    final q = _search.text.trim().toLowerCase();
    return _products.where((p) {
      if (q.isNotEmpty) return '${p['name']}'.toLowerCase().contains(q) || '${p['sku'] ?? ''}'.toLowerCase().contains(q);
      return _cat == null || p['category_id'] == _cat;
    }).toList();
  }

  Future<void> _onPhone(String raw) async {
    final digits = extractPhoneDigits(raw);
    setState(() => _customerId = null);
    if (digits.length < 3) {
      setState(() => _matches = []);
      return;
    }
    try {
      final r = await Api.i.customersSearch(fullPhone(digits));
      if (mounted) setState(() => _matches = asJsonList(r).take(6).toList());
    } catch (_) {
      if (mounted) setState(() => _matches = []);
    }
  }

  Future<void> _submit() async {
    if (_cart.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.onSubmit(BuiltOrder(
        lines: List.of(_cart.lines),
        note: _note.text.trim(),
        guests: _guests,
        phone: extractPhoneDigits(_phone.text),
        address: _address.text.trim(),
        customerId: _customerId,
      ));
      if (mounted) Navigator.pop(context, true);
    } on ApiError catch (e) {
      if (mounted) toast(context, '${t('create_order_error')}: ${e.message}', error: true);
    } catch (e) {
      if (mounted) toast(context, '${t('create_order_error')}: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openCart() => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => StatefulBuilder(builder: (ctx, setSheet) => _cartSheet(ctx, setSheet)),
      );

  Widget _cartSheet(BuildContext ctx, StateSetter setSheet) {
    void both(VoidCallback fn) {
      setState(fn);
      setSheet(() {});
    }

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (_, controller) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Row(children: [
            const Icon(Icons.shopping_bag_outlined, color: MC.teal600),
            const SizedBox(width: 8),
            Text(t('order'), style: MT.h2),
            const SizedBox(width: 8),
            CountBadge(_cart.itemCount.round()),
          ]),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(controller: controller, padding: const EdgeInsets.all(16), children: [
            if (_cart.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(t('tap_dish_hint'), textAlign: TextAlign.center, style: MT.bodyMuted)),
            for (final l in _cart.lines) _lineTile(ctx, l, both),
            if (widget.orderType == 'delivery') ...[
              const SizedBox(height: 8),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [PhoneInputFormatter()],
                onChanged: (v) {
                  _onPhone(v);
                  setSheet(() {});
                },
                decoration: const InputDecoration(hintText: '+998 90 123-45-67'),
              ),
              for (final c in _matches)
                ListTile(
                  dense: true,
                  title: Text('${c['phone']}${c['name'] != null ? ' · ${c['name']}' : ''}'),
                  onTap: () {
                    _phone.text = formatPhone(extractPhoneDigits('${c['phone'] ?? ''}'));
                    _customerId = '${c['id']}';
                    _matches = [];
                    setSheet(() {});
                  },
                ),
              const SizedBox(height: 10),
              TextField(controller: _address, decoration: InputDecoration(hintText: t('address'))),
            ],
            if (widget.showGuests)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(children: [
                  Expanded(child: Text(t('guests'), style: MT.label)),
                  IconButton.filledTonal(onPressed: _guests > 1 ? () => both(() => _guests--) : null, icon: const Icon(Icons.remove)),
                  SizedBox(width: 40, child: Center(child: Text('$_guests', style: MT.title))),
                  IconButton.filledTonal(onPressed: _guests < 50 ? () => both(() => _guests++) : null, icon: const Icon(Icons.add)),
                ]),
              ),
            if (!_cart.isEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: TextField(controller: _note, decoration: InputDecoration(hintText: t('comment')))),
          ]),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: MC.border))),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(t('total'), style: MT.title),
                Text(fmtMoney(_cart.subtotal), style: MT.title.copyWith(color: MC.teal600)),
              ]),
              const SizedBox(height: 12),
              BusyButton(
                label: widget.submitLabel,
                icon: Icons.add,
                busy: _busy,
                onPressed: _cart.isEmpty ? null : () {
                  Navigator.pop(ctx);
                  _submit();
                },
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _lineTile(BuildContext ctx, CartLine l, void Function(VoidCallback) both) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(MC.rMd), border: Border.all(color: MC.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            onTap: () => showDishSheet(ctx, l, hideTakeaway: widget.courier || !widget.canTakeaway, onChanged: () => both(() {})),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.name, style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                  if (l.note.isNotEmpty) Text(l.note, style: MT.small),
                  if (l.modifiers.isNotEmpty) Text(l.modifiers.map((m) => '${m['name']}').join(', '), style: MT.small.copyWith(color: MC.teal700)),
                ]),
              ),
              Text(fmtMoney(l.total), style: MT.money),
            ]),
          ),
          const SizedBox(height: 8),
          Row(children: [
            if (!widget.courier && widget.canTakeaway) ...[
              FilterChip(
                label: Text(t('takeaway')),
                selected: l.takeaway,
                showCheckmark: false,
                selectedColor: MC.teal500,
                labelStyle: MT.label.copyWith(color: l.takeaway ? Colors.white : MC.textSecondary, fontSize: 12.5),
                onSelected: (v) => both(() => l.takeaway = v),
              ),
            ],
            const Spacer(),
            IconButton.filledTonal(onPressed: () => both(() => _cart.changeQty(l.lineId, -1)), icon: const Icon(Icons.remove, size: 20)),
            SizedBox(width: 44, child: Center(child: Text(formatQtyNum(l.qty), style: MT.title.copyWith(fontSize: 16)))),
            IconButton.filledTonal(onPressed: () => both(() => _cart.changeQty(l.lineId, 1)), icon: const Icon(Icons.add, size: 20)),
            if (widget.canDeleteLines) IconButton(onPressed: () => both(() => _cart.remove(l.lineId)), icon: const Icon(Icons.delete_outline, color: MC.red500)),
          ]),
        ]),
      );

  static String formatQtyNum(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
        titleSpacing: 0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.title, style: MT.title),
          Text('${_cart.itemCount.round()} ${t('items_low')} · ${fmtMoney(_cart.subtotal)}', style: MT.small.copyWith(fontSize: 12.5)),
        ]),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: MC.border),
        ),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: t('search_dish'),
              prefixIcon: const Icon(Icons.search, color: MC.n400),
              isDense: true,
              suffixIcon: _search.text.isEmpty ? null : IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(_search.clear)),
            ),
          ),
        ),
        SizedBox(
          height: 46,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            children: [
              _catChip(null, t('all')),
              for (final c in _categories) _catChip('${c['id']}', '${c['name']}'),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : list.isEmpty
                  ? EmptyState(t('no_dishes'), icon: Icons.restaurant_menu)
                  : GridView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.86),
                      itemCount: list.length,
                      itemBuilder: (_, i) => _ProductCard(
                        product: list[i],
                        qty: _cart.qtyOf('${list[i]['id']}', takeaway: widget.courier),
                        onAdd: () => setState(() => _cart.add(list[i], takeaway: widget.courier)),
                        onDecrement: () => setState(() => _cart.decrement('${list[i]['id']}', takeaway: widget.courier)),
                      ),
                    ),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(color: MC.card, border: Border(top: BorderSide(color: MC.border))),
          child: BusyButton(
            label: _cart.isEmpty ? t('tap_dish_hint') : '${t('order')} · ${_cart.itemCount.round()} · ${fmtMoney(_cart.subtotal)}',
            icon: Icons.shopping_bag_outlined,
            busy: _busy,
            onPressed: _cart.isEmpty ? null : _openCart,
          ),
        ),
      ),
    );
  }

  Widget _catChip(String? id, String label) {
    final on = _cat == id;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: on,
        showCheckmark: false,
        selectedColor: MC.teal500,
        backgroundColor: MC.card,
        side: BorderSide(color: on ? MC.teal500 : MC.border),
        labelStyle: MT.label.copyWith(color: on ? Colors.white : MC.textSecondary),
        onSelected: (_) => setState(() => _cat = id),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.qty, required this.onAdd, required this.onDecrement});
  final Json product;
  final double qty;
  final VoidCallback onAdd;
  final VoidCallback onDecrement;

  @override
  Widget build(BuildContext context) {
    final stopped = isStopped(product);
    final img = product['image_url'] as String?;
    return Opacity(
      opacity: stopped ? 0.55 : 1,
      child: Card2(
        onTap: stopped ? null : onAdd,
        padding: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Stack(children: [
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(MC.rMd),
                  child: img != null && img.isNotEmpty
                      ? Image.network(img, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _placeholder())
                      : _placeholder(),
                ),
              ),
              if (stopped)
                Positioned(
                  left: 6,
                  top: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: MC.red500, borderRadius: BorderRadius.circular(6)),
                    child: const Text('STOP', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 8),
          Text('${product['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: MT.body.copyWith(fontWeight: FontWeight.w600, fontSize: 14, height: 1.2)),
          const SizedBox(height: 2),
          Row(children: [
            Expanded(child: Text(fmtMoney(toNum(product['price'])), maxLines: 1, overflow: TextOverflow.ellipsis, style: MT.money.copyWith(fontSize: 14))),
            if (qty > 0) ...[const SizedBox(width: 4), _QtyStepper(qty: qty, onAdd: onAdd, onDecrement: onDecrement)],
          ]),
        ]),
      ),
    );
  }

  Widget _placeholder() => Container(color: MC.n100, child: const Center(child: Icon(Icons.restaurant, size: 30, color: MC.n300)));
}

/// Compact +/- on the menu card itself, once a dish is in the cart — change
/// quantity right there instead of having to open the cart sheet.
class _QtyStepper extends StatelessWidget {
  const _QtyStepper({required this.qty, required this.onAdd, required this.onDecrement});
  final double qty;
  final VoidCallback onAdd;
  final VoidCallback onDecrement;

  @override
  Widget build(BuildContext context) => Material(
        color: MC.teal50,
        borderRadius: BorderRadius.circular(999),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          _btn(Icons.remove, onDecrement),
          SizedBox(width: 18, child: Center(child: Text(_OrderBuilderScreenState.formatQtyNum(qty), style: MT.small.copyWith(fontSize: 12, fontWeight: FontWeight.w800, color: MC.teal700)))),
          _btn(Icons.add, onAdd),
        ]),
      );

  Widget _btn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(padding: const EdgeInsets.all(4), child: Icon(icon, size: 13, color: MC.teal700)),
      );
}
