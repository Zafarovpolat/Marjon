import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';

const _hiddenRoles = {'owner', 'manager', 'warehouse'};

String _roleOf(Json u) => '${u['role_slug'] ?? ((u['role_slugs'] as List?)?.firstOrNull ?? '')}';
String _time(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  return d == null ? '' : DateFormat('HH:mm').format(d);
}

/// Cashier attendance: mark check-in/out for anyone, confirm self-marks, today's log.
/// Port of desktop AttendancePanel.
class AttendancePanel extends StatefulWidget {
  const AttendancePanel({super.key, this.user});
  final Json? user;
  @override
  State<AttendancePanel> createState() => _AttendancePanelState();
}

class _AttendancePanelState extends State<AttendancePanel> {
  List<Json> staff = [];
  List<Json> journal = [];
  List<Json> pending = [];
  bool loading = true;
  String? busyId;
  String q = '';

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<List<Json>> _safe(Future<dynamic> f) async {
    try {
      return asJsonList(await f);
    } catch (_) {
      return [];
    }
  }

  Future<void> _reload() async {
    setState(() => loading = true);
    final r = await Future.wait([
      _safe(Api.i.branchColleagues()),
      _safe(Api.i.attendanceLog()),
      _safe(Api.i.attendancePending()),
    ]);
    staff = r[0].where((u) => u['is_active'] != false && !_hiddenRoles.contains(_roleOf(u).toLowerCase())).toList();
    journal = r[1];
    pending = r[2];
    if (mounted) setState(() => loading = false);
  }

  Map<String, String> get _last {
    final m = <String, String>{};
    for (final r in journal) {
      final uid = '${r['user_id'] ?? ''}';
      if (uid.isNotEmpty) m.putIfAbsent(uid, () => '${r['action']}');
    }
    return m;
  }

  Future<void> _mark(Json u, String action) async {
    if (busyId != null) return;
    setState(() => busyId = '${u['id']}');
    try {
      await Api.i.attendanceMark('${u['id']}', action);
      if (mounted) toast(context, action == 'check_in' ? t('att_marked_in') : t('att_marked_out'));
      journal = await _safe(Api.i.attendanceLog());
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busyId = null);
    }
  }

  Future<void> _decide(Json row, bool approve) async {
    if (busyId != null) return;
    setState(() {
      busyId = '${row['id']}';
      pending.removeWhere((x) => x['id'] == row['id']);
    });
    try {
      await Api.i.attendanceApprove('${row['id']}', approve);
      if (mounted) toast(context, approve ? t('att_approved') : t('att_rejected'));
      journal = await _safe(Api.i.attendanceLog());
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
      pending = await _safe(Api.i.attendancePending());
    } finally {
      if (mounted) setState(() => busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final last = _last;
    final s = q.trim().toLowerCase();
    final shown = staff.where((u) => s.isEmpty || '${u['name'] ?? u['email'] ?? ''}'.toLowerCase().contains(s)).toList();
    final onCount = staff.where((u) => last['${u['id']}'] == 'check_in').length;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(t('attendance_page')),
          actions: [IconBtn(icon: Icons.refresh, onTap: _reload, tooltip: t('att_refresh'))],
          bottom: TabBar(tabs: [
            Tab(text: '${t('att_staff')} · ${staff.length}'),
            Tab(text: '${t('att_pending')}${pending.isEmpty ? '' : ' · ${pending.length}'}'),
            Tab(text: '${t('att_journal')} · ${journal.length}'),
          ]),
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Row(children: [
                    _Stat(onCount, t('att_cnt_on'), MC.green600),
                    const SizedBox(width: 8),
                    _Stat(staff.length - onCount, t('att_cnt_off'), MC.n600),
                    const SizedBox(width: 8),
                    _Stat(journal.length, t('att_cnt_marks'), MC.teal600),
                  ]),
                ),
                Expanded(
                  child: TabBarView(children: [
                    Column(children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                        child: TextField(onChanged: (v) => setState(() => q = v), decoration: InputDecoration(hintText: t('att_search'), prefixIcon: const Icon(Icons.search), isDense: true)),
                      ),
                      Expanded(
                        child: shown.isEmpty
                            ? EmptyState(t('att_no_staff'), icon: Icons.groups_outlined)
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                itemCount: shown.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 8),
                                itemBuilder: (_, i) => _staffCard(shown[i], last['${shown[i]['id']}'] == 'check_in'),
                              ),
                      ),
                    ]),
                    pending.isEmpty
                        ? EmptyState(t('att_empty'), icon: Icons.task_alt)
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: pending.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _pendingCard(pending[i]),
                          ),
                    journal.isEmpty
                        ? EmptyState(t('att_journal_empty'), icon: Icons.history)
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: journal.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final r = journal[i];
                              final isIn = r['action'] == 'check_in';
                              return ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(isIn ? Icons.login : Icons.logout, color: isIn ? MC.green600 : MC.red500, size: 20),
                                title: Text('${r['employee_name'] ?? '—'}', style: MT.body),
                                subtitle: Text(isIn ? t('att_check_in') : t('att_check_out'), style: MT.small),
                                trailing: Text(_time(r['timestamp']), style: MT.money),
                              );
                            },
                          ),
                  ]),
                ),
              ]),
      ),
    );
  }

  Widget _staffCard(Json u, bool on) {
    final name = '${u['name'] ?? u['email'] ?? ''}';
    final busy = busyId == '${u['id']}';
    return Card2(
      borderColor: on ? MC.green600 : MC.border,
      child: Row(children: [
        Avatar(name, size: 42),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: MT.body.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(tRole(_roleOf(u)), style: MT.small),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          on ? Pill(t('att_on_shift'), bg: MC.green100, fg: MC.green600, dot: true) : Pill(t('att_off_shift'), dot: true),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
            child: on
                ? OutlinedButton.icon(onPressed: busy ? null : () => _mark(u, 'check_out'), icon: const Icon(Icons.logout, size: 16), label: Text(t('att_mark_out')))
                : ElevatedButton.icon(onPressed: busy ? null : () => _mark(u, 'check_in'), icon: const Icon(Icons.login, size: 16), label: Text(t('att_mark_in'))),
          ),
        ]),
      ]),
    );
  }

  Widget _pendingCard(Json row) {
    final isIn = row['action'] == 'check_in';
    final busy = busyId == '${row['id']}';
    return Card2(
      child: Row(children: [
        Icon(isIn ? Icons.login : Icons.logout, color: isIn ? MC.green600 : MC.red500),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${row['employee_name'] ?? '—'}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
            Text('${isIn ? t('att_check_in') : t('att_check_out')} · ${_time(row['timestamp'])}', style: MT.small),
          ]),
        ),
        IconBtn(icon: Icons.check_circle, color: MC.green600, tooltip: t('att_approve'), onTap: busy ? null : () => _decide(row, true)),
        IconBtn(icon: Icons.cancel, color: MC.red500, tooltip: t('att_reject'), onTap: busy ? null : () => _decide(row, false)),
      ]),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.n, this.label, this.color);
  final int n;
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Card2(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
          child: Column(children: [
            Text('$n', style: MT.h2.copyWith(color: color)),
            Text(label, style: MT.small, maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
      );
}
