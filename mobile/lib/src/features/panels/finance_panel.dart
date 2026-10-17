import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';

String _dt(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  return d == null ? '' : DateFormat('dd.MM HH:mm').format(d);
}

/// Cash desk: shift open/close and income/expense operations. Port of FinancePanel.
class FinancePanel extends StatefulWidget {
  const FinancePanel({super.key, required this.user, required this.branchId});
  final Json? user;
  final String branchId;
  @override
  State<FinancePanel> createState() => _FinancePanelState();
}

class _FinancePanelState extends State<FinancePanel> {
  Json? shift;
  List<Json> txs = [];
  bool loading = true;
  bool busy = false;
  final cash = TextEditingController();
  final amount = TextEditingController();
  final comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    cash.dispose();
    amount.dispose();
    comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = asJson(await Api.i.currentShift(widget.branchId));
      shift = s['id'] != null ? s : null;
    } catch (_) {
      shift = null;
    }
    try {
      final d = await Api.i.incomeExpense({'size': 30});
      txs = asJsonList(d is Map ? d['items'] : d);
    } catch (_) {
      txs = [];
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _run(Future<void> Function() fn, String errKey) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await fn();
      await _load();
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message.isEmpty ? t(errKey) : e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  num get _cash => num.tryParse(cash.text.trim()) ?? 0;

  Future<void> _add(String kind) async {
    final amt = num.tryParse(amount.text.trim()) ?? 0;
    if (amt <= 0) return;
    await _run(() async {
      await Api.i.addCashFlow({'direction': kind, 'amount': amt, if (comment.text.trim().isNotEmpty) 'comment': comment.text.trim()});
      amount.clear();
      comment.clear();
    }, 'op_err');
  }

  @override
  Widget build(BuildContext context) {
    final isOpen = shift != null && shift!['status'] == 'open';
    return Scaffold(
      appBar: AppBar(title: Text(t('fin_title'))),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Text(t('shift').toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Card2(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (isOpen) ...[
                    _row(t('status'), Pill(t('fin_status_open'), bg: MC.green100, fg: MC.green600, dot: true)),
                    _row(t('opened_label'), Text(_dt(shift!['opened_at']), style: MT.body)),
                    _row(t('cash_start_bal'), Text(fmtMoney(toNum(shift!['opening_cash'])), style: MT.money)),
                    const Divider(height: 24),
                  ],
                  Labeled(isOpen ? t('cash_end') : t('cash_start_input'), TextField(controller: cash, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: '0'))),
                  const SizedBox(height: 12),
                  isOpen
                      ? BusyButton(label: t('close_shift'), icon: Icons.stop, danger: true, busy: busy, onPressed: () => _run(() => Api.i.closeShift(_cash).then((_) => cash.clear()), 'shift_close_err'))
                      : BusyButton(label: t('open_shift'), icon: Icons.play_arrow, busy: busy, onPressed: () => _run(() => Api.i.openShift(widget.branchId, _cash).then((_) => cash.clear()), 'shift_open_err')),
                ]),
              ),
              if (Perm.must(widget.user, 'can_cash_ops')) ...[
                const SizedBox(height: 20),
                Text(t('income_expense').toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Card2(
                  child: Column(children: [
                    TextField(controller: amount, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: t('amount_sum'))),
                    const SizedBox(height: 10),
                    TextField(controller: comment, decoration: InputDecoration(hintText: t('comment'))),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: BusyButton(label: t('income'), icon: Icons.trending_up, busy: busy, onPressed: () => _add('income'))),
                      const SizedBox(width: 10),
                      Expanded(child: BusyButton(label: t('expense'), icon: Icons.trending_down, danger: true, busy: busy, onPressed: () => _add('expense'))),
                    ]),
                  ]),
                ),
              ],
              const SizedBox(height: 20),
              Text(t('recent_ops').toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(t('past_locked'), style: MT.small),
              const SizedBox(height: 8),
              if (txs.isEmpty)
                Padding(padding: const EdgeInsets.all(16), child: Text(t('no_ops'), style: MT.bodyMuted))
              else
                for (final tx in txs)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(tx['direction'] == 'income' ? Icons.trending_up : Icons.trending_down, color: tx['direction'] == 'income' ? MC.green600 : MC.red500),
                    title: Text('${tx['comment'] ?? tx['category_name'] ?? (tx['direction'] == 'income' ? t('income') : t('expense'))}', style: MT.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(_dt(tx['date']), style: MT.small),
                    trailing: Text('${tx['direction'] == 'income' ? '+' : '−'}${fmtNum(toNum(tx['amount']))}', style: MT.money.copyWith(color: tx['direction'] == 'income' ? MC.green600 : MC.red600)),
                  ),
            ]),
    );
  }

  Widget _row(String k, Widget v) => Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(k, style: MT.bodyMuted), v]));
}
