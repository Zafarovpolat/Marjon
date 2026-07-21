import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  List<dynamic> _orders = [];
  String? _branchFilter;
  String? _statusFilter;
  DateTime _date = DateTime.now();
  bool _loading = true;

  static const _statuses = {
    'new': 'Новый', 'accepted': 'Принят', 'cooking': 'Готовится',
    'ready': 'Готов', 'completed': 'Закрыт', 'cancelled': 'Отменён',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(_date);
      final list = await Api().orders(branchId: _branchFilter, status: _statusFilter, date: dateStr);
      if (!mounted) return;
      setState(() { _orders = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  double get _totalRevenue => _orders
    .fold<double>(0, (s, o) => s + (double.tryParse(o['total_amount']?.toString() ?? '0') ?? 0));

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context, initialDate: _date,
      firstDate: DateTime(2024), lastDate: DateTime.now(),
    );
    if (d != null) { _date = d; _load(); }
  }

  Color _statusColor(String s) {
    const map = {'new': T.accentLight, 'accepted': Color(0xFF4ADE80), 'cooking': Color(0xFFFB923C),
                 'ready': Color(0xFF86EFAC), 'completed': Color(0xFF64748B), 'cancelled': Color(0xFFF87171)};
    return map[s] ?? T.muted;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Заказы'),
        actions: [
          IconButton(icon: const Icon(Icons.calendar_today), onPressed: _pickDate),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : Column(children: [
            // Date + summary
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: T.surface,
              child: Row(children: [
                GestureDetector(
                  onTap: _pickDate,
                  child: Row(children: [
                    const Icon(Icons.calendar_today, size: 16, color: T.accent),
                    const SizedBox(width: 6),
                    Text(DateFormat('dd.MM.yyyy').format(_date), style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                ),
                const Spacer(),
                Text('${_orders.length} заказов', style: const TextStyle(color: T.muted, fontSize: 13)),
                const SizedBox(width: 12),
                Text(_fmt(_totalRevenue), style: const TextStyle(fontWeight: FontWeight.bold, color: T.success)),
                const Text(' сум', style: TextStyle(color: T.muted, fontSize: 12)),
              ]),
            ),
            // Filters
            SizedBox(height: 44, child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
              children: [
                _filterChip('Все', _statusFilter == null, () => setState(() { _statusFilter = null; _load(); })),
                ..._statuses.entries.map((e) => _filterChip(
                  e.value, _statusFilter == e.key,
                  () => setState(() { _statusFilter = _statusFilter == e.key ? null : e.key; _load(); }),
                )),
              ],
            )),
            // Orders
            Expanded(child: RefreshIndicator(
              onRefresh: _load,
              child: ResponsiveBox(
                child: _orders.isEmpty
                  ? const Center(child: Text('Нет заказов', style: TextStyle(color: T.muted)))
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _orders.length,
                      itemBuilder: (_, i) {
                        final o = _orders[i];
                        final items = o['items'] as List? ?? [];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: T.surface, borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: T.border, width: 0.5),
                          ),
                          child: ExpansionTile(
                            tilePadding: const EdgeInsets.symmetric(horizontal: 14),
                            childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                            shape: const Border(),
                            title: Row(children: [
                              Text('#${o['order_number']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                              if (o['table_number'] != null) Text('  Стол ${o['table_number']}', style: const TextStyle(color: T.muted, fontSize: 13)),
                              const Spacer(),
                              Text(_fmt(o['total_amount']), style: const TextStyle(fontWeight: FontWeight.bold)),
                            ]),
                            subtitle: Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: _statusColor(o['status']).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(_statuses[o['status']] ?? o['status'],
                                  style: TextStyle(color: _statusColor(o['status']), fontSize: 11, fontWeight: FontWeight.w600)),
                              ),
                              const SizedBox(width: 8),
                              Text(_fmtTime(o['created_at']), style: const TextStyle(color: T.muted, fontSize: 12)),
                            ]),
                            children: items.map<Widget>((it) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Row(children: [
                                Text('×${it['quantity']}', style: const TextStyle(color: T.accent, fontWeight: FontWeight.bold)),
                                const SizedBox(width: 8),
                                Expanded(child: Text(it['name'], style: const TextStyle(fontSize: 14))),
                                Text('${_fmt(it['total'])} сум', style: const TextStyle(color: T.muted, fontSize: 13)),
                              ]),
                            )).toList(),
                          ),
                        );
                      },
                    ),
              ),
            )),
          ]),
    );
  }

  Widget _filterChip(String label, bool active, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: FilterChip(label: Text(label, style: TextStyle(fontSize: 12, color: active ? T.accent : T.muted)),
      selected: active, selectedColor: T.accent.withValues(alpha: 0.15), onSelected: (_) => onTap()),
  );

  String _fmtTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '';
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

String _fmt(dynamic v) {
  final n = num.tryParse(v.toString()) ?? 0;
  return n.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]} ');
}
