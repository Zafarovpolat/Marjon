import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key});
  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  bool _loading = true;

  DateTime _from = DateTime.now().subtract(const Duration(days: 30));
  DateTime _to   = DateTime.now();

  List<Map<String, dynamic>> _allTx = [];
  List<Map<String, dynamic>> _cats  = [];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        Api().financeTransactions(
          dateFrom: fmtIsoDate(_from), dateTo: fmtIsoDate(_to)),
        Api().transactionCategories(),
      ]);
      final data    = results[0];
      final catData = results[1];
      _allTx = List<Map<String, dynamic>>.from(data['items'] ?? []);
      _cats  = List<Map<String, dynamic>>.from(catData['items'] ?? []);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<Map<String, dynamic>> get _income  => _allTx.where((t) => t['direction'] == 'income').toList();
  List<Map<String, dynamic>> get _expense => _allTx.where((t) => t['direction'] == 'expense').toList();

  double _sum(List<Map<String, dynamic>> list) => list.fold(0.0, (s, t) => s + toDouble(t['amount']));

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: T.bg,
    appBar: AppBar(
      title: const Text('Финансы'),
      bottom: TabBar(controller: _tabs, tabs: const [
        Tab(text: 'Доходы'),
        Tab(text: 'Расходы'),
      ]),
    ),
    floatingActionButton: FloatingActionButton.extended(
      backgroundColor: T.accent,
      onPressed: _showAddSheet,
      icon: const Icon(Icons.add, color: Colors.white),
      label: const Text('Добавить', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
    ),
    body: Column(children: [
      _buildSummaryBar(),
      _buildDateFilter(),
      Expanded(
        child: _loading
          ? const LoadingCenter()
          : TabBarView(controller: _tabs, children: [
              _TxList(items: _income,  onRefresh: _load),
              _TxList(items: _expense, onRefresh: _load),
            ]),
      ),
    ]),
  );

  Widget _buildSummaryBar() {
    final inc = _sum(_income);
    final exp = _sum(_expense);
    final bal = inc - exp;
    return Container(
      color: T.surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(children: [
        _summaryChip('Доходы', inc, T.success),
        const SizedBox(width: 8),
        _summaryChip('Расходы', exp, T.danger),
        const SizedBox(width: 8),
        _summaryChip('Баланс', bal, bal >= 0 ? T.accent : T.danger),
      ]),
    );
  }

  Widget _summaryChip(String label, double val, Color color) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 10, color: T.muted)),
        const SizedBox(height: 2),
        Text(fmtNum(val, compact: true),
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ]),
    ),
  );

  Widget _buildDateFilter() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
    child: DateRangeHeader(
      from: _from, to: _to,
      onChanged: (r) {
        setState(() { _from = r.start; _to = r.end; });
        _load();
      },
    ),
  );

  void _showAddSheet({Map<String, dynamic>? existing}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TxSheet(
        existing: existing,
        cats: _cats,
        direction: _tabs.index == 0 ? 'income' : 'expense',
        onSaved: _load,
      ),
    );
  }
}

// ── Transaction list ──────────────────────────────────────────────────────────

class _TxList extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final Future<void> Function() onRefresh;
  const _TxList({required this.items, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const EmptyState(
        icon: Icons.account_balance_wallet_outlined,
        message: 'Нет транзакций',
        sub: 'Добавьте первую транзакцию',
      );
    }
    return RefreshIndicator(
      color: T.accent,
      onRefresh: onRefresh,
      child: ResponsiveBox(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          itemCount: items.length,
          itemBuilder: (_, i) => _TxRow(tx: items[i]),
        ),
      ),
    );
  }
}

class _TxRow extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TxRow({required this.tx});

  @override
  Widget build(BuildContext context) {
    final isIncome = tx['direction'] == 'income';
    final color = isIncome ? T.success : T.danger;
    final amount = toDouble(tx['amount']);
    final cat = tx['category']?['name']?.toString() ?? tx['category_name']?.toString() ?? '';
    final note = tx['note']?.toString() ?? tx['description']?.toString() ?? '';
    final date = fmtDateTime(tx['created_at']?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: Container(
          width: 40, height: 40, alignment: Alignment.center,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
          child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
            color: color, size: 20),
        ),
        title: Row(children: [
          Text(isIncome ? 'Доход' : 'Расход',
            style: const TextStyle(fontWeight: FontWeight.w600, color: T.text, fontSize: 14)),
          if (cat.isNotEmpty) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: T.surfaceLight, borderRadius: BorderRadius.circular(6)),
              child: Text(cat, style: const TextStyle(fontSize: 11, color: T.muted)),
            ),
          ],
        ]),
        subtitle: note.isNotEmpty
          ? Text(note, style: const TextStyle(color: T.muted, fontSize: 12), maxLines: 1,
              overflow: TextOverflow.ellipsis)
          : Text(date, style: const TextStyle(color: T.muted, fontSize: 12)),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${isIncome ? '+' : '−'}${fmtNum(amount, compact: true)} UZS',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: color)),
          const SizedBox(height: 2),
          Text(date, style: const TextStyle(fontSize: 10, color: T.muted)),
        ]),
      ),
    );
  }
}

// ── Add/Edit sheet ────────────────────────────────────────────────────────────

class _TxSheet extends StatefulWidget {
  final Map<String, dynamic>? existing;
  final List<Map<String, dynamic>> cats;
  final String direction;
  final VoidCallback onSaved;
  const _TxSheet({this.existing, required this.cats, required this.direction, required this.onSaved});

  @override
  State<_TxSheet> createState() => _TxSheetState();
}

class _TxSheetState extends State<_TxSheet> {
  final _amount = TextEditingController();
  final _note   = TextEditingController();
  String? _catId;
  String _dir = 'income';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _dir = widget.existing?['direction'] ?? widget.direction;
    _amount.text = widget.existing?['amount']?.toString() ?? '';
    _note.text   = widget.existing?['note']?.toString()
                ?? widget.existing?['description']?.toString() ?? '';
    _catId = widget.existing?['category_id']?.toString()
          ?? widget.existing?['category']?['id']?.toString();
  }

  @override
  void dispose() { _amount.dispose(); _note.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_amount.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final data = {
        'amount': double.tryParse(_amount.text.replaceAll(',', '.')) ?? 0,
        'direction': _dir,
        'note': _note.text.trim(),
        if (_catId != null) 'category_id': _catId,
      };
      if (widget.existing != null) {
        await Api().updateTransaction(widget.existing!['id'].toString(), data);
      } else {
        await Api().createTransaction(data);
      }
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: widget.existing == null ? 'Новая транзакция' : 'Редактировать',
    submitLabel: 'Сохранить',
    onSubmit: _save,
    loading: _saving,
    fields: [
      // Direction toggle
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(children: [
          Expanded(child: _dirBtn('income', 'Доход', T.success)),
          const SizedBox(width: 10),
          Expanded(child: _dirBtn('expense', 'Расход', T.danger)),
        ]),
      ),
      mField('Сумма (UZS)', _amount, keyboard: const TextInputType.numberWithOptions(decimal: true)),
      // Category
      if (widget.cats.isNotEmpty)
        mDropdown<String>('Категория', _catId,
          widget.cats.map((c) => DropdownMenuItem(
            value: c['id'].toString(), child: Text(c['name'] ?? '—'))).toList(),
          (v) => setState(() => _catId = v)),
      mField('Примечание', _note, maxLines: 3),
    ],
  );

  Widget _dirBtn(String dir, String label, Color color) => GestureDetector(
    onTap: () => setState(() => _dir = dir),
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.symmetric(vertical: 12),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: _dir == dir ? color.withValues(alpha: 0.15) : T.bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _dir == dir ? color : T.border, width: 1.5),
      ),
      child: Text(label, style: TextStyle(
        fontWeight: FontWeight.w700, fontSize: 14,
        color: _dir == dir ? color : T.muted)),
    ),
  );
}
