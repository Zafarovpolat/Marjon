import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import 'cart.dart';

/// Edit an order line: portion, total price, add-ons, take-away, comment.
/// Portion and price are tied through the per-portion price (with add-ons):
/// total = portion x price. Port of desktop DishModal.
Future<void> showDishSheet(BuildContext context, CartLine line, {bool hideTakeaway = false, required VoidCallback onChanged}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => DishSheet(line: line, hideTakeaway: hideTakeaway, onChanged: onChanged),
    );

class DishSheet extends StatefulWidget {
  const DishSheet({super.key, required this.line, required this.hideTakeaway, required this.onChanged});
  final CartLine line;
  final bool hideTakeaway;
  final VoidCallback onChanged;
  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  late final double _unit;
  late final double _cost;
  late Map<String, Map<String, dynamic>> _selected;
  late final TextEditingController _qty;
  late final TextEditingController _total;
  late final TextEditingController _note;
  late bool _takeaway;

  double get _modDelta => _selected.values.fold(0.0, (s, m) => s + toNum(m['price_delta']));
  double get _linePrice => _unit + _modDelta;
  double get _qtyNum => double.tryParse(_qty.text.replaceAll(',', '.')) ?? 0;

  @override
  void initState() {
    super.initState();
    final l = widget.line;
    final initDelta = l.modifiers.fold(0.0, (s, m) => s + toNum(m['price_delta']));
    _unit = l.price - initDelta;
    _cost = toNum(l.product['cost_price']).toDouble();
    _selected = {for (final m in l.modifiers) if (m['id'] != null) '${m['id']}': m};
    _qty = TextEditingController(text: _fmt(l.qty > 0 ? l.qty : 1));
    _total = TextEditingController(text: '${(l.qty * l.price).round()}');
    _note = TextEditingController(text: l.note);
    _takeaway = l.takeaway;
  }

  @override
  void dispose() {
    _qty.dispose();
    _total.dispose();
    _note.dispose();
    super.dispose();
  }

  static String _fmt(double v) {
    final r = (v * 100).floor() / 100;
    return r == r.roundToDouble() ? r.toInt().toString() : r.toString();
  }

  void _setQty(double q) {
    q = (q * 100).round() / 100;
    if (q <= 0) q = 0.01;
    _qty.text = _fmt(q);
    _total.text = '${(q * _linePrice).round()}';
    setState(() {});
  }

  void _onQtyTyped(String v) {
    final q = double.tryParse(v.replaceAll(',', '.'));
    if (q != null && q > 0) _total.text = '${(q * _linePrice).round()}';
    setState(() {});
  }

  void _onTotalTyped(String v) {
    final s = double.tryParse(v);
    if (s != null && s > 0 && _linePrice > 0) _qty.text = (s / _linePrice).toStringAsFixed(4).replaceFirst(RegExp(r'\.?0+$'), '');
    setState(() {});
  }

  void _stepTotal(int d) {
    final cur = double.tryParse(_total.text) ?? 0;
    final min = _linePrice > 0 ? (_linePrice * 0.1).round().clamp(1, 1 << 30) : 0;
    final next = (cur + d).clamp(min, double.infinity);
    _total.text = '${next.round()}';
    _onTotalTyped(_total.text);
  }

  void _toggleMod(Map<String, dynamic> group, Map<String, dynamic> mod) {
    final ids = ((group['modifiers'] as List?) ?? []).map((m) => '${(m as Map)['id']}').toList();
    final id = '${mod['id']}';
    if (_selected.containsKey(id)) {
      _selected.remove(id);
    } else {
      final maxSel = toNum(group['max_select']).toInt();
      if (maxSel <= 1) {
        for (final i in ids) {
          _selected.remove(i);
        }
      } else if (ids.where(_selected.containsKey).length >= maxSel) {
        return;
      }
      _selected[id] = {
        'id': mod['id'],
        'name': mod['name'],
        'price_delta': toNum(mod['price_delta']),
        'group_id': group['id'],
        'group_name': group['name'],
      };
    }
    _total.text = '${(_qtyNum * _linePrice).round()}';
    setState(() {});
  }

  void _save() {
    final l = widget.line;
    l.qty = _qtyNum > 0 ? _qtyNum : 1;
    l.price = _linePrice;
    l.note = _note.text.trim();
    l.takeaway = _takeaway;
    l.modifiers = _selected.values.toList();
    widget.onChanged();
    Navigator.pop(context);
  }

  Widget _stepper({required String title, required String hint, required Widget middle, required VoidCallback onMinus, required VoidCallback onPlus, bool accent = false}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: accent ? MC.brandSubtle : MC.n50,
          borderRadius: BorderRadius.circular(MC.rLg),
          border: Border.all(color: accent ? MC.teal100 : MC.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(title, style: MT.label), Text(hint, style: MT.small)]),
          const SizedBox(height: 8),
          Row(children: [
            IconButton.filledTonal(onPressed: onMinus, icon: const Icon(Icons.remove), iconSize: 24),
            Expanded(child: middle),
            IconButton.filledTonal(onPressed: onPlus, icon: const Icon(Icons.add), iconSize: 24),
          ]),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final groups = ((widget.line.product['modifier_groups'] as List?) ?? []).whereType<Map>().map((e) => e.cast<String, dynamic>()).where((g) => g['show_in_pos'] != false).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.line.name, style: MT.h2),
          const SizedBox(height: 14),
          _stepper(
            title: t('qty'),
            hint: '× ${fmtNum(_linePrice)} ${t('currency')}',
            onMinus: () => _setQty(_qtyNum - 1),
            onPlus: () => _setQty(_qtyNum + 1),
            middle: TextField(
              controller: _qty,
              textAlign: TextAlign.center,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: MT.title.copyWith(fontSize: 24),
              decoration: const InputDecoration(border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, filled: false),
              onChanged: _onQtyTyped,
            ),
          ),
          const SizedBox(height: 10),
          _stepper(
            title: t('price'),
            hint: '${t('qty')}: ${_qty.text}',
            accent: true,
            onMinus: () => _stepTotal(-500),
            onPlus: () => _stepTotal(500),
            middle: TextField(
              controller: _total,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              style: MT.title.copyWith(fontSize: 24, color: MC.teal600),
              decoration: InputDecoration(border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, filled: false, suffixText: t('currency')),
              onChanged: _onTotalTyped,
            ),
          ),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t('cost_price'), style: MT.label), Text(t('cost_fixed'), style: MT.small)]),
            Text(_cost > 0 ? fmtMoney(_cost) : '—', style: MT.title.copyWith(fontSize: 16)),
          ]),
          for (final g in groups) ...[
            const SizedBox(height: 14),
            Row(children: [
              Text('${g['name']}', style: MT.label),
              if (g['is_required'] == true) Padding(padding: const EdgeInsets.only(left: 8), child: Text(t('addon_required'), style: MT.small.copyWith(color: MC.amber700))),
            ]),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final m in ((g['modifiers'] as List?) ?? []).whereType<Map>().map((e) => e.cast<String, dynamic>()))
                FilterChip(
                  selected: _selected.containsKey('${m['id']}'),
                  showCheckmark: false,
                  selectedColor: MC.teal500,
                  labelStyle: MT.label.copyWith(color: _selected.containsKey('${m['id']}') ? Colors.white : MC.textSecondary),
                  label: Text('${m['name']}${toNum(m['price_delta']) != 0 ? '  ${toNum(m['price_delta']) > 0 ? '+' : ''}${fmtNum(toNum(m['price_delta']))}' : ''}'),
                  onSelected: (_) => _toggleMod(g, m),
                ),
            ]),
          ],
          if (!widget.hideTakeaway) SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('takeaway'), style: MT.body.copyWith(fontWeight: FontWeight.w600)), value: _takeaway, onChanged: (v) => setState(() => _takeaway = v)),
          const SizedBox(height: 8),
          Text(t('comment'), style: MT.label),
          const SizedBox(height: 6),
          TextField(controller: _note, minLines: 2, maxLines: 3, decoration: InputDecoration(hintText: t('dish_note_ph'))),
          const SizedBox(height: 18),
          BusyButton(label: t('save'), onPressed: _save),
        ]),
      ),
    );
  }
}
