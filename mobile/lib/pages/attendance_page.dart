import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

// 5.5 — экран посещаемости кассира. Кассир отмечает приход/уход любого сотрудника
// (отметка кассира = разрешение зайти → сразу approved на бэкенде), видит журнал
// за сегодня и подтверждает/отклоняет самостоятельные отметки из очереди (pending).

// Владелец/менеджер/кладовщик не работают на кассе-терминале — прячем из ростера.
const _hiddenRoles = {'owner', 'manager', 'warehouse'};
const _avatarColors = [
  Color(0xFF1DB5B5), Color(0xFF2563EB), Color(0xFF7C3AED), Color(0xFFF59E0B),
  Color(0xFF16A34A), Color(0xFFEF4444), Color(0xFF0E8080), Color(0xFFE11D48),
];

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  final letters = parts.take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join();
  return letters.isEmpty ? '?' : letters;
}

Color _avatarColor(String name) {
  var h = 0;
  for (final c in name.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return _avatarColors[h % _avatarColors.length];
}

String? _roleOf(Map<String, dynamic> u) {
  final slug = u['role_slug'];
  if (slug is String && slug.isNotEmpty) return slug;
  final slugs = u['role_slugs'];
  if (slugs is List && slugs.isNotEmpty) return slugs.first?.toString();
  return null;
}

const _roleLabels = {
  'owner': 'Владелец', 'admin': 'Администратор', 'manager': 'Менеджер',
  'cashier': 'Кассир', 'waiter': 'Официант', 'kitchen': 'Повар',
  'bar': 'Бармен', 'courier': 'Курьер', 'accountant': 'Бухгалтер',
  'warehouse': 'Кладовщик',
};
String _roleLabel(String? slug) => _roleLabels[slug] ?? (slug ?? '—');

String _fmtTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return '';
  return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
}

class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key});
  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<Map<String, dynamic>> _staff = [];
  List<Map<String, dynamic>> _journal = [];
  List<Map<String, dynamic>> _pending = [];
  bool _loading = true;
  String? _busyId;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _reload();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    final branchId = context.read<AppState>().branch?['id'] as String?;
    final results = await Future.wait([
      Api().staffUsers(branchId: branchId).catchError((_) => <dynamic>[]),
      Api().attendanceLog().catchError((_) => <dynamic>[]),
      Api().attendancePending().catchError((_) => <dynamic>[]),
    ]);
    if (!mounted) return;
    setState(() {
      _staff = List<Map<String, dynamic>>.from(results[0]).where((u) {
        final active = u['is_active'] != false;
        final role = (_roleOf(u) ?? '').toLowerCase();
        return active && !_hiddenRoles.contains(role);
      }).toList();
      _journal = List<Map<String, dynamic>>.from(results[1]);
      _pending = List<Map<String, dynamic>>.from(results[2]);
      _loading = false;
    });
  }

  // user_id → последнее действие за сегодня (журнал desc → первое совпадение свежее).
  Map<String, String> get _lastAction {
    final m = <String, String>{};
    for (final r in _journal) {
      final uid = r['user_id']?.toString();
      final action = r['action']?.toString();
      if (uid != null && action != null && !m.containsKey(uid)) m[uid] = action;
    }
    return m;
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _staff;
    return _staff.where((u) {
      final name = (u['name'] ?? u['email'] ?? '').toString().toLowerCase();
      return name.contains(q);
    }).toList();
  }

  Future<void> _mark(Map<String, dynamic> u, String action) async {
    setState(() => _busyId = u['id']?.toString());
    try {
      await Api().attendanceMark(u['id'] as String, action);
      if (!mounted) return;
      showSnack(context, action == 'check_in' ? 'Отмечен приход' : 'Отмечен уход');
      final log = await Api().attendanceLog().catchError((_) => <dynamic>[]);
      if (!mounted) return;
      setState(() => _journal = List<Map<String, dynamic>>.from(log));
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _decide(Map<String, dynamic> row, bool approve) async {
    final id = row['id']?.toString();
    setState(() {
      _busyId = id;
      _pending = _pending.where((x) => x['id']?.toString() != id).toList(); // оптимистично
    });
    try {
      await Api().attendanceApprove(row['id'] as String, approve);
      if (!mounted) return;
      showSnack(context, approve ? 'Отметка подтверждена' : 'Отметка отклонена');
      final log = await Api().attendanceLog().catchError((_) => <dynamic>[]);
      if (!mounted) return;
      setState(() => _journal = List<Map<String, dynamic>>.from(log));
    } catch (e) {
      if (!mounted) return;
      showSnack(context, e.toString(), error: true);
      final pend = await Api().attendancePending().catchError((_) => <dynamic>[]);
      if (mounted) setState(() => _pending = List<Map<String, dynamic>>.from(pend)); // откат
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  int get _onShiftCount =>
      _staff.where((u) => _lastAction[u['id']?.toString()] == 'check_in').length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Посещаемость'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Обновить',
            onPressed: _loading ? null : _reload,
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: [
            Tab(text: 'Сотрудники (${_filtered.length})'),
            Tab(text: 'Журнал (${_journal.length})'),
          ],
        ),
      ),
      body: _loading
          ? const LoadingCenter()
          : Column(children: [
              _statsBar(),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [_rosterTab(), _journalTab()],
                ),
              ),
            ]),
    );
  }

  Widget _statsBar() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    color: AppTheme.surface,
    child: Row(children: [
      _stat('$_onShiftCount', 'На смене', AppTheme.success),
      _stat('${(_staff.length - _onShiftCount).clamp(0, _staff.length)}', 'Отсутствуют', AppTheme.textMuted),
      _stat('${_journal.length}', 'Отметок', AppTheme.accent),
    ]),
  );

  Widget _stat(String value, String label, Color color) => Expanded(
    child: Column(children: [
      Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
      Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
    ]),
  );

  Widget _rosterTab() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
        child: TextField(
          decoration: const InputDecoration(
            hintText: 'Поиск сотрудника…',
            prefixIcon: Icon(Icons.search),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _query = v),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: _reload,
          child: (_pending.isEmpty && _filtered.isEmpty)
              ? const EmptyState(
                  icon: Icons.people_outline, message: 'Сотрудники не найдены')
              : ListView(
                  padding: EdgeInsets.fromLTRB(
                    12, 8, 12, MediaQuery.of(context).padding.bottom + 12),
                  children: [
                    if (_pending.isNotEmpty) ...[
                      const _SectionLabel('На подтверждение'),
                      ..._pending.map(_pendingRow),
                      const SizedBox(height: 12),
                      const _SectionLabel('Сотрудники'),
                    ],
                    ..._filtered.map(_staffCard),
                  ],
                ),
        ),
      ),
    ]);
  }

  Widget _staffCard(Map<String, dynamic> u) {
    final id = u['id']?.toString();
    final name = (u['name'] ?? u['email'] ?? '—').toString();
    final on = _lastAction[id] == 'check_in';
    final busy = _busyId == id;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: on ? AppTheme.success : AppTheme.border, width: on ? 1 : 0.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          Row(children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: _avatarColor(name),
              child: Text(_initials(name),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              Text(_roleLabel(_roleOf(u)),
                style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: (on ? AppTheme.success : AppTheme.textMuted).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(on ? 'На смене' : 'Отсутствует',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold,
                  color: on ? AppTheme.success : AppTheme.textMuted)),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: ElevatedButton.icon(
              icon: const Icon(Icons.login, size: 18),
              label: const Text('Пришёл'),
              onPressed: (busy || on) ? null : () => _mark(u, 'check_in'),
            )),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Ушёл'),
              style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
              onPressed: (busy || !on) ? null : () => _mark(u, 'check_out'),
            )),
          ]),
        ]),
      ),
    );
  }

  Widget _pendingRow(Map<String, dynamic> row) {
    final id = row['id']?.toString();
    final isIn = row['action'] == 'check_in';
    final busy = _busyId == id;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.warning.withValues(alpha: 0.4), width: 0.5),
      ),
      child: Row(children: [
        Icon(isIn ? Icons.login : Icons.logout, size: 20,
          color: isIn ? AppTheme.success : AppTheme.danger),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((row['employee_name'] ?? '—').toString(), maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          Text('${isIn ? 'Пришёл' : 'Ушёл'} · ${_fmtTime(row['timestamp']?.toString())}',
            style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
        ])),
        IconButton(
          icon: const Icon(Icons.check_circle, color: AppTheme.success),
          onPressed: busy ? null : () => _decide(row, true),
        ),
        IconButton(
          icon: const Icon(Icons.cancel, color: AppTheme.danger),
          onPressed: busy ? null : () => _decide(row, false),
        ),
      ]),
    );
  }

  Widget _journalTab() {
    if (_journal.isEmpty) {
      return const EmptyState(icon: Icons.history, message: 'Отметок сегодня ещё нет');
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.separated(
        padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
        itemCount: _journal.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final r = _journal[i];
          final isIn = r['action'] == 'check_in';
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: [
              Container(width: 10, height: 10,
                decoration: BoxDecoration(shape: BoxShape.circle,
                  color: isIn ? AppTheme.success : AppTheme.danger)),
              const SizedBox(width: 12),
              Expanded(child: Text((r['employee_name'] ?? '—').toString(),
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
              Text(isIn ? 'Пришёл' : 'Ушёл',
                style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
              const SizedBox(width: 12),
              Text(_fmtTime(r['timestamp']?.toString()),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textColor)),
            ]),
          );
        },
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8, top: 2),
    child: Text(text.toUpperCase(),
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold,
        letterSpacing: 0.5, color: AppTheme.textMuted)),
  );
}
