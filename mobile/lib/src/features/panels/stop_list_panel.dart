import 'package:flutter/material.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import '../order/cart.dart';

/// Stop-list = dish availability, plus the daily portion limit. Port of StopListPanel.
class StopListPanel extends StatefulWidget {
  const StopListPanel({super.key, this.user});
  final Json? user;
  @override
  State<StopListPanel> createState() => _StopListPanelState();
}

class _StopListPanelState extends State<StopListPanel> {
  List<Json> products = [];
  bool loading = true;
  String search = '';
  bool onlyStop = false;
  String? busyId;

  bool get canEdit => Perm.can(widget.user, 'can_edit_stop_list');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      products = asJsonList(await Api.i.products());
    } catch (_) {
      products = [];
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _toggle(Json p) async {
    if (!canEdit) return;
    final makeAvailable = isStopped(p);
    setState(() {
      busyId = '${p['id']}';
      p['is_available'] = makeAvailable;
      p['in_stop_list'] = !makeAvailable;
    });
    try {
      await Api.i.setAvailable('${p['id']}', makeAvailable);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
      _load();
    } finally {
      if (mounted) setState(() => busyId = null);
    }
  }

  Future<void> _openDetail(Json p) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _StopDetail(product: p, canEdit: canEdit, onToggle: _toggle)));
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final shown = products.where((p) {
      if (onlyStop && !isStopped(p)) return false;
      return search.isEmpty || '${p['name']}'.toLowerCase().contains(search.toLowerCase());
    }).toList();
    final stopCount = products.where(isStopped).length;
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [const Icon(Icons.block, size: 20), const SizedBox(width: 8), Flexible(child: Text(t('stoplist'), maxLines: 1, overflow: TextOverflow.ellipsis)), if (stopCount > 0) ...[const SizedBox(width: 8), CountBadge(stopCount)]]),
        bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Container(height: 1, color: MC.border)),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(children: [
            Expanded(child: TextField(onChanged: (v) => setState(() => search = v), decoration: InputDecoration(hintText: t('search_dish'), prefixIcon: const Icon(Icons.search), isDense: true))),
            const SizedBox(width: 8),
            FilterChip(label: Text(t('only_stop')), selected: onlyStop, showCheckmark: false, selectedColor: MC.red100, onSelected: (v) => setState(() => onlyStop = v)),
          ]),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : shown.isEmpty
                  ? EmptyState(t('nothing_found'), icon: Icons.search_off)
                  : GridView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.95),
                      itemCount: shown.length,
                      itemBuilder: (_, i) {
                        final p = shown[i];
                        final stopped = isStopped(p);
                        return Card2(
                          onTap: () => _openDetail(p),
                          borderColor: stopped ? MC.red500 : MC.border,
                          padding: const EdgeInsets.all(10),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Expanded(
                              child: Stack(children: [
                                Positioned.fill(child: ClipRRect(borderRadius: BorderRadius.circular(MC.rMd), child: _thumb(p))),
                                if (stopped) Positioned(left: 6, top: 6, child: Pill('STOP', bg: MC.red500, fg: Colors.white)),
                                if (p['daily_limit'] != null) Positioned(right: 6, top: 6, child: Pill('${p['sold_count'] ?? 0}/${p['daily_limit']}', bg: MC.n900, fg: Colors.white)),
                              ]),
                            ),
                            const SizedBox(height: 6),
                            Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: MT.body.copyWith(fontWeight: FontWeight.w600, fontSize: 14)),
                            Text(fmtMoney(toNum(p['price'])), style: MT.money.copyWith(fontSize: 13)),
                          ]),
                        );
                      },
                    ),
        ),
      ]),
    );
  }
}

Widget _thumb(Json p) {
  final img = p['image_url'] as String?;
  return img != null && img.isNotEmpty
      ? Image.network(img, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _ph())
      : _ph();
}

Widget _ph() => Container(color: MC.n100, child: const Center(child: Icon(Icons.restaurant, size: 30, color: MC.n300)));

class _StopDetail extends StatefulWidget {
  const _StopDetail({required this.product, required this.canEdit, required this.onToggle});
  final Json product;
  final bool canEdit;
  final Future<void> Function(Json p) onToggle;
  @override
  State<_StopDetail> createState() => _StopDetailState();
}

class _StopDetailState extends State<_StopDetail> {
  late final TextEditingController _limit = TextEditingController(text: widget.product['daily_limit']?.toString() ?? '');
  bool busy = false;

  @override
  void dispose() {
    _limit.dispose();
    super.dispose();
  }

  Future<void> _saveLimit() async {
    final raw = _limit.text.trim();
    int? value;
    if (raw.isNotEmpty) {
      value = int.tryParse(raw);
      if (value == null || value < 1) {
        toast(context, t('limit_invalid'), error: true);
        return;
      }
    }
    setState(() => busy = true);
    try {
      final updated = await Api.i.setLimit('${widget.product['id']}', value);
      widget.product.addAll(asJson(updated));
      if (mounted) toast(context, value == null ? t('limit_cleared') : t('limit_saved'));
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final stopped = isStopped(p);
    return Scaffold(
      appBar: AppBar(title: Text('${p['name']}'), bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Container(height: 1, color: MC.border))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        ClipRRect(borderRadius: BorderRadius.circular(MC.rLg), child: SizedBox(height: 180, child: _thumb(p))),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(fmtMoney(toNum(p['price'])), style: MT.h2.copyWith(color: MC.teal600)),
          stopped ? Pill(t('in_stop'), bg: MC.red100, fg: MC.red600, icon: Icons.block) : Pill(t('available'), bg: MC.green100, fg: MC.green600, icon: Icons.check),
        ]),
        if (widget.canEdit) ...[
          const SizedBox(height: 20),
          Text(t('availability').toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          BusyButton(
            label: stopped ? t('return_item') : t('to_stop'),
            icon: stopped ? Icons.check : Icons.block,
            danger: !stopped,
            onPressed: () async {
              await widget.onToggle(p);
              if (mounted) setState(() {});
            },
          ),
          const SizedBox(height: 22),
          Text(t('daily_max').toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(t('limit_hint'), style: MT.small),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: _limit, enabled: !busy, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: t('no_limit')))),
            const SizedBox(width: 10),
            SizedBox(width: 120, child: BusyButton(label: t('save'), busy: busy, onPressed: _saveLimit)),
          ]),
          if (p['daily_limit'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${t('sold')}: ${p['sold_count'] ?? 0} / ${p['daily_limit']}', style: MT.label)),
        ],
      ]),
    );
  }
}
