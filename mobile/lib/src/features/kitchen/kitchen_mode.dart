import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../net/store.dart';
import '../../services/kitchen_ws.dart';
import '../../services/sound.dart';
import '../../session/session.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';
import '../panels/recipe_sheet.dart';
import '../panels/stop_list_panel.dart';

/// The backend may send naive UTC timestamps — treat them as UTC or timers lie.
DateTime parseTs(dynamic ts) {
  if (ts == null) return DateTime.now();
  var s = '$ts';
  if (!RegExp(r'[zZ]|[+-]\d\d:?\d\d$').hasMatch(s)) s = '${s.replaceFirst(' ', 'T')}Z';
  return DateTime.tryParse(s) ?? DateTime.now();
}

/// Kitchen display: incoming orders as cards with timers, item-level done buttons,
/// "order ready" hand-over, recipe cards and the stop-list. Port of KitchenMode.
class KitchenMode extends StatefulWidget {
  const KitchenMode({super.key, required this.session});
  final Session session;
  @override
  State<KitchenMode> createState() => _KitchenModeState();
}

class _KitchenModeState extends State<KitchenMode> {
  List<Json> orders = [];
  bool loading = true;
  String filter = 'all';
  bool soundOn = SoundService.i.enabled;
  Set<String> prevIds = {};
  Timer? _tick;
  DateTime now = DateTime.now();
  final List<void Function()> _unsubs = [];

  int get greenMs => Store.timerYellow * 60000;
  int get yellowMs => Store.timerRed * 60000;
  String get branchId => widget.session.branchId;

  @override
  void initState() {
    super.initState();
    _load();
    _unsubs.addAll([
      KitchenWs.i.on('connection', (d) {
        if (d is Map && d['status'] == 'online') _load();
      }),
      KitchenWs.i.on('new_order', (_) {
        SoundService.i.play('newOrder');
        _load();
      }),
      KitchenWs.i.on('order_updated', (_) => _load()),
      KitchenWs.i.on('order_cancelled', (_) {
        SoundService.i.play('orderCancelled');
        _load();
      }),
    ]);
    _tick = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) setState(() => now = DateTime.now());
      _syncOverdueAlerts();
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    for (final u in _unsubs) {
      u();
    }
    SoundService.i.stopAll();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = asJsonList(await Api.i.kitchenOrders(branchId));
      final ids = list.map((o) => '${o['id']}').toSet();
      if (prevIds.isNotEmpty && ids.any((id) => !prevIds.contains(id))) SoundService.i.play('newOrder');
      prevIds = ids;
      if (mounted) setState(() => orders = list);
    } catch (_) {}
    if (mounted) setState(() => loading = false);
  }

  void _syncOverdueAlerts() {
    for (final o in orders) {
      final elapsed = now.difference(parseTs(o['created_at'])).inMilliseconds;
      final id = '${o['id']}';
      if (elapsed > yellowMs) {
        SoundService.i.startOverdue(id);
      } else {
        SoundService.i.stopOverdue(id);
      }
    }
  }

  Future<void> _itemDone(String itemId) async {
    setState(() {
      for (final o in orders) {
        for (final it in asJsonList(o['items'])) {
          if ('${it['id']}' == itemId) it['status'] = 'ready';
        }
      }
    });
    SoundService.i.play('orderCompleted');
    try {
      await Api.i.itemStatus(itemId, 'ready');
    } catch (_) {}
  }

  Future<void> _orderDone(String orderId) async {
    try {
      await Api.i.orderReady(orderId);
    } catch (_) {
      final o = orders.firstWhere((x) => '${x['id']}' == orderId, orElse: () => {});
      try {
        for (final it in asJsonList(o['items']).where((i) => i['status'] != 'ready' && i['status'] != 'done')) {
          await Api.i.itemStatus('${it['id']}', 'ready');
        }
      } catch (_) {
        _load();
        return;
      }
    }
    if (!mounted) return;
    setState(() => orders.removeWhere((o) => '${o['id']}' == orderId));
    SoundService.i.stopOverdue(orderId);
    SoundService.i.play('orderCompleted');
  }

  bool _match(Json o, String f) {
    final s = o['status'];
    return switch (f) {
      'new' => s == 'new' || s == 'pending',
      'cooking' => s == 'cooking' || s == 'in_progress',
      'ready' => s == 'ready',
      _ => true,
    };
  }

  (Color, Color) _timerColors(dynamic createdAt) {
    final ms = now.difference(parseTs(createdAt)).inMilliseconds;
    if (ms < greenMs) return (MC.green500, MC.green100);
    if (ms < yellowMs) return (MC.amber500, MC.amber100);
    return (MC.red500, MC.red100);
  }

  String _elapsed(dynamic createdAt) {
    final sec = now.difference(parseTs(createdAt)).inSeconds.clamp(0, 1 << 30);
    return '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final filters = [
      ('all', t('all'), Icons.grid_view_rounded),
      ('new', t('new_orders'), Icons.schedule),
      ('cooking', t('cooking_orders'), Icons.local_fire_department_outlined),
      ('ready', t('ready_orders'), Icons.check_circle_outline),
    ];
    final shown = filter == 'all' ? orders : orders.where((o) => _match(o, filter)).toList();
    final inWork = orders.where((o) => o['status'] == 'cooking' || o['status'] == 'in_progress').length;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 4),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t('mode_kitchen'), style: MT.h2),
              Text('${orders.length} ${t('orders_low')} · $inWork ${t('in_work')}', style: MT.small.copyWith(fontSize: 13)),
            ]),
          ),
          IconBtn(icon: Icons.block, tooltip: t('stoplist'), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StopListPanel(user: widget.session.staffUser)))),
          IconBtn(
            icon: soundOn ? Icons.volume_up_outlined : Icons.volume_off_outlined,
            tooltip: soundOn ? t('sound_on') : t('sound_off'),
            onTap: () => setState(() {
              soundOn = !soundOn;
              SoundService.i.enabled = soundOn;
            }),
          ),
        ]),
      ),
      SizedBox(
        height: 46,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          children: [
            for (final (id, label, icon) in filters)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  avatar: Icon(icon, size: 17, color: filter == id ? Colors.white : MC.n600),
                  label: Text('$label  ${id == 'all' ? orders.length : orders.where((o) => _match(o, id)).length}'),
                  selected: filter == id,
                  showCheckmark: false,
                  selectedColor: MC.teal500,
                  backgroundColor: MC.card,
                  side: BorderSide(color: filter == id ? MC.teal500 : MC.border),
                  labelStyle: MT.label.copyWith(color: filter == id ? Colors.white : MC.textSecondary),
                  onSelected: (_) => setState(() => filter = id),
                ),
              ),
          ],
        ),
      ),
      const Divider(height: 1),
      Expanded(
        child: RefreshIndicator(
          onRefresh: _load,
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : shown.isEmpty
                  ? ListView(children: [const SizedBox(height: 80), EmptyState('${t('no_orders')}\n${t('new_orders_auto')}', icon: Icons.check_circle_outline)])
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: shown.length,
                      itemBuilder: (_, i) {
                        final o = shown[i];
                        final (accent, tint) = _timerColors(o['created_at']);
                        return _KitchenCard(
                          order: o,
                          accent: accent,
                          tint: tint,
                          elapsed: _elapsed(o['created_at']),
                          onItemDone: _itemDone,
                          onOrderDone: _orderDone,
                          onRecipe: (pid, name) => showRecipeSheet(context, productId: pid, name: name),
                        );
                      },
                    ),
        ),
      ),
    ]);
  }
}

class _KitchenCard extends StatelessWidget {
  const _KitchenCard({required this.order, required this.accent, required this.tint, required this.elapsed, required this.onItemDone, required this.onOrderDone, required this.onRecipe});
  final Json order;
  final Color accent;
  final Color tint;
  final String elapsed;
  final Future<void> Function(String) onItemDone;
  final Future<void> Function(String) onOrderDone;
  final void Function(String productId, String name) onRecipe;

  @override
  Widget build(BuildContext context) {
    final items = asJsonList(order['items']);
    bool isDone(Json i) => i['status'] == 'ready' || i['status'] == 'done';
    final done = items.where(isDone).length;
    final all = items.isNotEmpty && done == items.length;
    final type = order['order_type'];
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(MC.rLg), border: Border.all(color: accent, width: 1.6)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          color: tint,
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Row(children: [
            Text('#${order['order_number'] ?? order['id']}', style: MT.title),
            if (order['table_number'] != null) Padding(padding: const EdgeInsets.only(left: 10), child: Text('${t('table')} ${order['table_number']}', style: MT.label)),
            Padding(padding: const EdgeInsets.only(left: 8), child: Icon(type == 'takeaway' ? Icons.shopping_bag_outlined : (type == 'delivery' ? Icons.two_wheeler : Icons.restaurant), size: 16, color: MC.n600)),
            const Spacer(),
            Icon(Icons.schedule, size: 15, color: accent),
            const SizedBox(width: 4),
            Text(elapsed, style: MT.mono.copyWith(color: accent, fontWeight: FontWeight.w700, fontSize: 15)),
          ]),
        ),
        if (order['note'] != null && '${order['note']}'.isNotEmpty)
          Container(
            width: double.infinity,
            color: MC.amber100,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(children: [const Icon(Icons.warning_amber_rounded, size: 16, color: MC.amber700), const SizedBox(width: 6), Expanded(child: Text('${order['note']}', style: MT.small.copyWith(color: MC.amber700, fontSize: 13)))]),
          ),
        LinearProgressIndicator(value: items.isEmpty ? 0 : done / items.length, minHeight: 4, backgroundColor: MC.n100, color: MC.green500),
        for (final it in items)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 4),
            child: Opacity(
              opacity: isDone(it) ? 0.5 : 1,
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${formatQty(it['quantity'])}×', style: MT.money.copyWith(color: MC.textSecondary, fontSize: 16)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${it['name'] ?? it['product_name']}', style: MT.body.copyWith(fontWeight: FontWeight.w600, fontSize: 16, decoration: isDone(it) ? TextDecoration.lineThrough : null)),
                    if (it['note'] != null && '${it['note']}'.isNotEmpty) Text('${it['note']}', style: MT.small.copyWith(color: MC.amber700)),
                  ]),
                ),
                if (it['product_id'] != null) IconButton(icon: const Icon(Icons.menu_book_outlined, size: 20, color: MC.n500), onPressed: () => onRecipe('${it['product_id']}', '${it['name'] ?? it['product_name']}'), tooltip: t('tech_card')),
                isDone(it)
                    ? const Padding(padding: EdgeInsets.all(10), child: Icon(Icons.check_circle, color: MC.green500))
                    : IconButton.filled(style: IconButton.styleFrom(backgroundColor: MC.green500), onPressed: () => onItemDone('${it['id']}'), icon: const Icon(Icons.check, color: Colors.white), tooltip: t('done')),
              ]),
            ),
          ),
        const SizedBox(height: 6),
        if (all)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
            child: BusyButton(label: t('order_ready_give'), icon: Icons.check_circle_outline, onPressed: () => onOrderDone('${order['id']}')),
          )
        else
          const SizedBox(height: 8),
      ]),
    );
  }
}
