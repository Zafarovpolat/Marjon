import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/export.dart';
import '../../ui/kit.dart';
import '../reports/reports_pages.dart';
import '../common/resource_page.dart';
import '../common/resources.dart';

class FinanceHubPage extends StatelessWidget {
  const FinanceHubPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Финансы')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          _Tile(Icons.payments_outlined, 'Денежные операции', () => push(context, const TransactionsPage())),
          _Tile(Icons.south_west, 'Категории приходов', () => push(context, ResourcePage(transactionCategoriesConfig('income')))),
          _Tile(Icons.north_east, 'Категории расходов', () => push(context, ResourcePage(transactionCategoriesConfig('expense')))),
          _Tile(Icons.people_alt_outlined, 'Контрагенты', () => push(context, ResourcePage(counterpartiesConfig))),
          _Tile(Icons.history, 'История изменений', () => push(context, ResourcePage(financeHistoryConfig))),
          _Tile(Icons.account_balance_wallet_outlined, 'Дебиторы и кредиторы', () => push(context, const ReportPage(kind: 'debt'))),
        ]),
      );
}

class _Tile extends StatelessWidget {
  const _Tile(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card2(onTap: onTap, child: Row(children: [Icon(icon, color: MC.teal600), const SizedBox(width: 14), Expanded(child: Text(label, style: MT.body.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right, color: MC.n300)])),
      );
}

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({super.key});
  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  DateTime from = DateTime.now();
  DateTime to = DateTime.now();
  String dir = 'all';
  int gen = 0;
  List<Json> _rows = [];

  Future<void> _add() async {
    final ok = await push<bool>(context, const TransactionForm());
    if (ok == true) setState(() => gen++);
  }

  Future<void> _export() => exportRowsAsCsv(context, filename: 'Денежные операции', rows: _rows);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Денежные операции'), actions: [IconBtn(icon: Icons.ios_share, tooltip: 'Экспорт в CSV', onTap: _export)]),
        floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add), label: const Text('Операция')),
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: DateRangeBar(from: from, to: to, onChanged: (a, b) => setState(() {
                from = a;
                to = b;
                gen++;
              }))),
          ChipTabs(items: const {'all': 'Все', 'income': 'Приходы', 'expense': 'Расходы'}, value: dir, onChanged: (v) => setState(() {
                dir = v;
                gen++;
              })),
          Expanded(
            child: AsyncBody<List<Json>>(
              reloadKey: gen,
              load: () async => asJsonList(await Api.i.get('/finance/transactions', query: {'date_from': isoDate(from), 'date_to': isoDate(to), if (dir != 'all') 'direction': dir})),
              builder: (_, rows, reload) {
                _rows = rows;
                num inc = 0, exp = 0;
                for (final r in rows) {
                  r['direction'] == 'income' ? inc += toNum(r['amount']) : exp += toNum(r['amount']);
                }
                return RefreshIndicator(
                  onRefresh: reload,
                  child: rows.isEmpty
                      ? ListView(children: const [SizedBox(height: 260, child: EmptyState('Операций за период нет', icon: Icons.payments_outlined))])
                      : ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
                          Card2(child: Column(children: [
                            KV('Приход', '+${fmtMoney(inc)}', color: MC.green600, bold: true),
                            KV('Расход', '−${fmtMoney(exp)}', color: MC.red600, bold: true),
                          ])),
                          const SizedBox(height: 8),
                          for (final r in rows)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Card2(
                                onTap: () async {
                                  final ok = await push<bool>(context, TransactionForm(item: r));
                                  if (ok == true) reload();
                                },
                                child: Row(children: [
                                  Icon(r['direction'] == 'income' ? Icons.south_west : Icons.north_east, color: r['direction'] == 'income' ? MC.green600 : MC.red500),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('${r['comment'] ?? r['category_name'] ?? (r['direction'] == 'income' ? 'Приход' : 'Расход')}', style: MT.body.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                                      Text(fmtDateTime(r['date']), style: MT.small),
                                    ]),
                                  ),
                                  Text('${r['direction'] == 'income' ? '+' : '−'}${fmtNum(toNum(r['amount']))}', style: MT.money.copyWith(color: r['direction'] == 'income' ? MC.green600 : MC.red600)),
                                ]),
                              ),
                            ),
                        ]),
                );
              },
            ),
          ),
        ]),
      );
}

class TransactionForm extends StatefulWidget {
  const TransactionForm({super.key, this.item});
  final Json? item;
  @override
  State<TransactionForm> createState() => _TransactionFormState();
}

class _TransactionFormState extends State<TransactionForm> {
  late String direction = '${widget.item?['direction'] ?? 'expense'}';
  late final amount = TextEditingController(text: widget.item == null ? '' : '${toNum(widget.item!['amount'])}');
  late final comment = TextEditingController(text: '${widget.item?['comment'] ?? ''}');
  String? categoryId;
  String? paymentTypeId;
  Map<String, String> categories = {};
  Map<String, String> payments = {};
  bool busy = false;
  final _key = 'owner-finance-${DateTime.now().microsecondsSinceEpoch}';

  bool get isNew => widget.item == null;

  @override
  void initState() {
    super.initState();
    categoryId = widget.item?['category_id']?.toString();
    paymentTypeId = widget.item?['payment_type_id']?.toString();
    _loadCats();
    Api.i.get('/finance/payment-types', query: {'size': 200}).then((d) {
      if (mounted) setState(() => payments = {for (final r in asJsonList(d)) '${r['id']}': '${r['name']}'});
    }).catchError((_) {});
  }

  Future<void> _loadCats() async {
    try {
      final d = await Api.i.get('/finance/transaction-categories', query: {'kind': direction});
      if (mounted) setState(() => categories = {for (final r in asJsonList(d)) '${r['id']}': '${r['name']}'});
    } catch (_) {}
  }

  Future<void> _save() async {
    if (busy) return;
    final a = num.tryParse(amount.text.trim().replaceAll(',', '.'));
    if (a == null || a <= 0) {
      toast(context, 'Введите сумму', error: true);
      return;
    }
    final body = {'amount': a, 'category_id': categoryId, 'payment_type_id': paymentTypeId, 'comment': comment.text.trim().isEmpty ? null : comment.text.trim()};
    setState(() => busy = true);
    try {
      if (isNew) {
        await Api.i.post('/finance/transactions', data: {...body, 'direction': direction}, headers: {'Idempotency-Key': _key});
      } else {
        await Api.i.patch('/finance/transactions/${widget.item!['id']}', data: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(isNew ? 'Новая операция' : 'Операция')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          if (isNew)
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'income', label: Text('Приход'), icon: Icon(Icons.south_west)), ButtonSegment(value: 'expense', label: Text('Расход'), icon: Icon(Icons.north_east))],
              selected: {direction},
              onSelectionChanged: (s) {
                setState(() {
                  direction = s.first;
                  categoryId = null;
                });
                _loadCats();
              },
            ),
          const SizedBox(height: 16),
          Labeled('Сумма, сум', TextField(controller: amount, keyboardType: const TextInputType.numberWithOptions(decimal: true))),
          const SizedBox(height: 14),
          Labeled('Категория', DropdownButtonFormField<String>(initialValue: categories.containsKey(categoryId) ? categoryId : null, isExpanded: true, hint: const Text('Не выбрана'), items: [for (final e in categories.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => categoryId = v))),
          const SizedBox(height: 14),
          Labeled('Способ оплаты', DropdownButtonFormField<String>(initialValue: payments.containsKey(paymentTypeId) ? paymentTypeId : null, isExpanded: true, hint: const Text('Не выбран'), items: [for (final e in payments.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => paymentTypeId = v))),
          const SizedBox(height: 14),
          Labeled('Комментарий', TextField(controller: comment, maxLines: 2)),
          const SizedBox(height: 20),
          BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
        ]),
      );
}
