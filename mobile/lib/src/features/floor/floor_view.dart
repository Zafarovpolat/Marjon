import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../i18n/strings.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import 'floor_data.dart';

String fmtTime(dynamic iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse('$iso');
  return d == null ? '' : DateFormat('HH:mm').format(d.toLocal());
}

/// Hall selector chips + tables grid (or an order board for delivery / take-away).
class FloorView extends StatelessWidget {
  const FloorView({
    super.key,
    required this.floor,
    required this.activeZone,
    required this.onZone,
    required this.onTable,
    this.actions = const [],
    this.board,
    this.onBoardOrder,
    this.showZoneChips = true,
    this.extraChips = const [],
    this.onRefresh,
  });

  final FloorData floor;
  final String activeZone; // 'all' | hall id | 'delivery' | 'takeaway' | 'no_table'
  final ValueChanged<String> onZone;
  final ValueChanged<Json> onTable;
  final List<Widget> actions;
  final String? board; // 'delivery' | 'takeaway' | 'no_table' -> shows order cards instead of tables
  final ValueChanged<Json>? onBoardOrder;
  final bool showZoneChips;
  final List<({String id, String label, IconData icon, int count})> extraChips;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final f = floor;
    final all = f.allTables;
    final shown = activeZone == 'all' ? all : all.where((t) => t['zoneId'] == activeZone).toList();
    final busy = shown.where((t) => f.stateOf(t) != TableState.free).length;
    final zones = activeZone == 'all' ? f.halls : f.halls.where((z) => z['id'] == activeZone).toList();
    final boardOrders = board == null ? const <Json>[] : (board == 'no_table' ? f.noTableOrders : f.ordersOfType(board!));

    final chips = <({String id, String label, IconData icon, int count})>[
      (id: 'all', label: t('all'), icon: Icons.grid_view_rounded, count: f.freeCount(all)),
      for (final z in f.halls) (id: '${z['id']}', label: '${z['name']}', icon: zoneIcon('${z['name']}'), count: f.freeCount(asJsonList(z['tables']))),
      ...extraChips,
    ];

    return Column(children: [
      if (showZoneChips)
        SizedBox(
          height: 56,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            scrollDirection: Axis.horizontal,
            itemCount: chips.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final c = chips[i];
              final on = activeZone == c.id;
              return Material(
                color: on ? MC.teal500 : MC.card,
                borderRadius: BorderRadius.circular(MC.rMd),
                child: InkWell(
                  borderRadius: BorderRadius.circular(MC.rMd),
                  onTap: () => onZone(c.id),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(MC.rMd), border: Border.all(color: on ? MC.teal500 : MC.border)),
                    child: Row(children: [
                      Icon(c.icon, size: 19, color: on ? Colors.white : MC.n600),
                      const SizedBox(width: 8),
                      Text(c.label, style: MT.label.copyWith(color: on ? Colors.white : MC.textPrimary, fontSize: 14)),
                      const SizedBox(width: 8),
                      CountBadge(c.count, active: on),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
        child: LayoutBuilder(builder: (_, c) {
          final title = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(board != null ? t(board!) : t('tables'), style: MT.h2),
            Text(
              board != null ? '${boardOrders.length} ${t('orders_low')}' : '${shown.length} ${t('tables_low')} · $busy ${t('busy_low')}',
              style: MT.small.copyWith(fontSize: 13),
            ),
          ]);
          // on very narrow phones the actions go under the title instead of squeezing it
          if (c.maxWidth < 340 && actions.isNotEmpty) {
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              title,
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: actions),
            ]);
          }
          return Row(children: [Expanded(child: title), ...actions]);
        }),
      ),
      const Divider(height: 1),
      Expanded(
        child: RefreshIndicator(
          onRefresh: onRefresh ?? f.load,
          child: f.loading
              ? const Center(child: CircularProgressIndicator())
              : board != null
                  ? _boardGrid(context, boardOrders)
                  : _tables(context, zones),
        ),
      ),
    ]);
  }

  Widget _tables(BuildContext context, List<Json> zones) {
    if (zones.isEmpty) {
      return ListView(children: [const SizedBox(height: 80), EmptyState(t('no_halls'), icon: Icons.table_restaurant_outlined)]);
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        for (final z in zones) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 8, top: 4),
            child: Row(children: [
              Text('${z['name']}', style: MT.title.copyWith(fontSize: 16)),
              const SizedBox(width: 8),
              Text('${asJsonList(z['tables']).length} ${t('tables_low')}', style: MT.small),
            ]),
          ),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [for (final tb in asJsonList(z['tables'])) _TableCard(floor: floor, table: tb, onTap: () => onTable(tb))],
          ),
          const SizedBox(height: 14),
        ],
      ],
    );
  }

  Widget _boardGrid(BuildContext context, List<Json> list) {
    if (list.isEmpty) return ListView(children: [const SizedBox(height: 80), EmptyState(t('no_orders'), icon: Icons.receipt_long_outlined)]);
    return GridView.count(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.05,
      children: [
        for (final o in list)
          _OrderCard(order: o, delivery: o['order_type'] == 'delivery', onTap: onBoardOrder == null ? null : () => onBoardOrder!(o)),
      ],
    );
  }
}

class _TableCard extends StatelessWidget {
  const _TableCard({required this.floor, required this.table, required this.onTap});
  final FloorData floor;
  final Json table;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final st = floor.stateOf(table);
    final o = floor.orderFor(table);
    final (bg, border, pill) = switch (st) {
      TableState.free => (MC.card, MC.n300, Pill.free()),
      TableState.busy => (MC.card, MC.amber500.withValues(alpha: 0.55), Pill.busy()),
      TableState.ready => (MC.green100.withValues(alpha: 0.5), MC.green500, Pill.ready()),
      TableState.await => (MC.brandSubtle, MC.teal500, Pill(t('await'), bg: MC.teal100, fg: MC.teal700, dot: true)),
    };
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(MC.rLg),
      child: InkWell(
        borderRadius: BorderRadius.circular(MC.rLg),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(MC.rLg),
            border: Border.all(color: border, width: st == TableState.free ? 1 : 1.5),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('${table['number']}', style: const TextStyle(fontFamily: MC.fontDisplay, fontSize: 26, fontWeight: FontWeight.w700, color: MC.textPrimary, height: 1)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: MC.n100, borderRadius: BorderRadius.circular(999)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.people_alt_outlined, size: 13, color: MC.n600),
                  const SizedBox(width: 3),
                  Text('${table['capacity'] ?? table['seats'] ?? 4}', style: MT.small.copyWith(fontWeight: FontWeight.w700, color: MC.n600)),
                ]),
              ),
            ]),
            const Spacer(),
            if (o != null) ...[
              Text('${t('order_no')} #${o['order_number'] ?? ''}', style: MT.label.copyWith(color: MC.textPrimary, fontSize: 13)),
              const SizedBox(height: 2),
              Row(children: [
                const Icon(Icons.schedule, size: 13, color: MC.n500),
                const SizedBox(width: 3),
                Text(fmtTime(o['created_at']), style: MT.small),
                if (o['total_amount'] != null) ...[
                  const Spacer(),
                  Flexible(child: FittedBox(fit: BoxFit.scaleDown, child: Text(fmtMoney(toNum(o['total_amount'])), style: MT.money.copyWith(fontSize: 13)))),
                ],
              ]),
              const SizedBox(height: 6),
            ],
            pill,
          ]),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.delivery, required this.onTap});
  final Json order;
  final bool delivery;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ready = order['status'] == 'ready';
    final pay = order['receipt_printed_at'] != null;
    final border = ready ? MC.green500 : (pay ? MC.teal500 : MC.amber500.withValues(alpha: 0.55));
    final phone = '${order['customer_phone'] ?? ''}';
    return Card2(
      onTap: onTap,
      borderColor: border,
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('#${order['order_number'] ?? ''}', style: MT.title.copyWith(fontSize: 18)),
          const Spacer(),
          Icon(delivery ? Icons.two_wheeler : Icons.shopping_bag_outlined, size: 18, color: MC.teal600),
        ]),
        if (phone.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(formatPhone(extractPhoneDigits(phone)), style: MT.small.copyWith(fontSize: 12.5, color: MC.textPrimary))),
        if (delivery && order['customer_address'] != null) Text('${order['customer_address']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: MT.small),
        const Spacer(),
        Row(children: [
          const Icon(Icons.schedule, size: 13, color: MC.n500),
          const SizedBox(width: 3),
          Text(fmtTime(order['created_at']), style: MT.small),
          const Spacer(),
          if (order['total_amount'] != null) Flexible(child: Text(fmtMoney(toNum(order['total_amount'])), overflow: TextOverflow.ellipsis, style: MT.money.copyWith(fontSize: 13))),
        ]),
        const SizedBox(height: 6),
        Pill(tStatus('${order['status']}'), bg: ready ? MC.green100 : MC.amber100, fg: ready ? MC.green600 : MC.amber700, dot: true),
      ]),
    );
  }
}
