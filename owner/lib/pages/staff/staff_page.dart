import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class StaffPage extends StatefulWidget {
  const StaffPage({super.key});
  @override
  State<StaffPage> createState() => _StaffPageState();
}

class _StaffPageState extends State<StaffPage> {
  List<dynamic> _users = [];
  List<dynamic> _branches = [];
  bool _loading = true;
  String _search = '';

  static const _roleColors = {
    'owner': Color(0xFF6366F1),
    'admin': Color(0xFF6366F1),
    'cashier': Color(0xFF10B981),
    'waiter': Color(0xFF16A34A),
    'kitchen': Color(0xFFEF4444),
    'bar': Color(0xFF7C3AED),
  };
  static const _roleIcons = {
    'owner': Icons.admin_panel_settings,
    'admin': Icons.admin_panel_settings,
    'cashier': Icons.point_of_sale,
    'waiter': Icons.restaurant,
    'kitchen': Icons.soup_kitchen,
    'bar': Icons.local_bar,
  };
  static const _roleLabels = {
    'owner': 'Владелец',
    'admin': 'Администратор',
    'cashier': 'Кассир',
    'waiter': 'Официант',
    'kitchen': 'Повар',
    'bar': 'Бармен',
  };

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([Api().listUsers(), Api().branches()]);
      if (!mounted) return;
      setState(() {
        _users = results[0];
        _branches = results[1];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> get _filtered {
    if (_search.isEmpty) return _users;
    final q = _search.toLowerCase();
    return _users.where((u) =>
      (u['name']?.toString().toLowerCase().contains(q) ?? false) ||
      (u['email']?.toString().toLowerCase().contains(q) ?? false) ||
      (u['phone']?.toString().contains(q) ?? false)
    ).toList();
  }

  Future<void> _addUser() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _StaffForm(branches: _branches),
    );
    if (result == null) return;
    try {
      await Api().createUser(result);
      if (mounted) { showSnack(context, 'Сотрудник создан'); _load(); }
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
  }

  Future<void> _editUser(Map<String, dynamic> user) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _StaffForm(branches: _branches, initial: user),
    );
    if (result == null) return;
    try {
      await Api().updateUser(user['id'].toString(), result);
      if (mounted) { showSnack(context, 'Сохранено'); _load(); }
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
  }

  Future<void> _deleteUser(Map<String, dynamic> user) async {
    final name = user['name'] ?? user['email'] ?? 'сотрудника';
    final ok = await confirmDialog(context,
      title: 'Удалить сотрудника?',
      message: '"$name" будет удалён из системы');
    if (!ok) return;
    try {
      await Api().deleteUser(user['id'].toString());
      if (mounted) { showSnack(context, 'Удалено'); _load(); }
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
  }

  String _roleLabel(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    if (slugs.isEmpty) return 'Нет роли';
    return slugs.map((s) => _roleLabels[s] ?? s).join(', ');
  }

  Color _roleColor(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    return slugs.isEmpty ? T.muted : (_roleColors[slugs.first] ?? T.muted);
  }

  IconData _roleIcon(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    return slugs.isEmpty ? Icons.person : (_roleIcons[slugs.first] ?? Icons.person);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: T.bg,
    appBar: AppBar(
      title: const Text('Сотрудники'),
      actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
    ),
    floatingActionButton: FloatingActionButton.extended(
      backgroundColor: T.accent,
      onPressed: _addUser,
      icon: const Icon(Icons.person_add, color: Colors.white),
      label: const Text('Добавить', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
    ),
    body: Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
        child: TextField(
          decoration: const InputDecoration(
            hintText: 'Поиск по имени, email, телефону...',
            prefixIcon: Icon(Icons.search, size: 20),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _search = v),
        ),
      ),
      Expanded(
        child: _loading
          ? const LoadingCenter()
          : RefreshIndicator(
              color: T.accent,
              onRefresh: _load,
              child: ResponsiveBox(
                child: _filtered.isEmpty
                  ? EmptyState(
                      icon: Icons.people_outline,
                      message: _search.isNotEmpty ? 'Не найдено' : 'Нет сотрудников',
                      sub: _search.isEmpty ? 'Добавьте первого сотрудника' : null,
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                      itemCount: _filtered.length,
                      itemBuilder: (_, i) => _UserCard(
                        user: _filtered[i],
                        color: _roleColor(_filtered[i]),
                        icon: _roleIcon(_filtered[i]),
                        roleLabel: _roleLabel(_filtered[i]),
                        onEdit: () => _editUser(Map<String, dynamic>.from(_filtered[i])),
                        onDelete: () => _deleteUser(_filtered[i]),
                      ),
                    ),
              ),
            ),
      ),
    ]),
  );
}

class _UserCard extends StatelessWidget {
  final Map<String, dynamic> user;
  final Color color;
  final IconData icon;
  final String roleLabel;
  final VoidCallback onEdit, onDelete;
  const _UserCard({
    required this.user, required this.color, required this.icon,
    required this.roleLabel, required this.onEdit, required this.onDelete,
  });

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    decoration: BoxDecoration(
      color: T.surface, borderRadius: BorderRadius.circular(14),
      border: Border.all(color: T.border, width: 0.5),
    ),
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: Container(
        width: 44, height: 44, alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: color, size: 22),
      ),
      title: Text(user['name'] ?? user['email'] ?? '',
        style: const TextStyle(fontWeight: FontWeight.w600, color: T.text)),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (user['email'] != null)
          Text(user['email'], style: const TextStyle(color: T.muted, fontSize: 12)),
        if (user['phone'] != null)
          Text(user['phone'], style: const TextStyle(color: T.muted, fontSize: 12)),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
          child: Text(roleLabel,
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
      ]),
      isThreeLine: true,
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          icon: const Icon(Icons.edit_outlined, size: 19, color: T.muted),
          onPressed: onEdit,
        ),
        IconButton(
          icon: const Icon(Icons.delete_outline, size: 19, color: T.danger),
          onPressed: onDelete,
        ),
      ]),
    ),
  );
}

// ── Staff form ────────────────────────────────────────────────────────────────

class _StaffForm extends StatefulWidget {
  final List<dynamic> branches;
  final Map<String, dynamic>? initial;
  const _StaffForm({required this.branches, this.initial});
  @override
  State<_StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends State<_StaffForm> {
  late final TextEditingController _name, _email, _phone, _pass;
  String _role = 'waiter';
  bool _saving = false;

  static const _roles = [
    ('admin',   'Администратор'),
    ('cashier', 'Кассир'),
    ('waiter',  'Официант'),
    ('kitchen', 'Повар'),
    ('bar',     'Бармен'),
  ];

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final u = widget.initial;
    _name  = TextEditingController(text: u?['name']  ?? '');
    _email = TextEditingController(text: u?['email'] ?? '');
    _phone = TextEditingController(text: u?['phone'] ?? '');
    _pass  = TextEditingController();
    if (u != null) {
      final slugs = (u['role_slugs'] as List?)?.cast<String>() ?? [];
      if (slugs.isNotEmpty) {
        final slug = slugs.first;
        final valid = _roles.map((r) => r.$1).toSet();
        _role = valid.contains(slug) ? slug : 'admin';
      }
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _pass]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty) return;
    if (!_isEdit && _pass.text.isEmpty) return;
    setState(() => _saving = true);
    try {
      final data = <String, dynamic>{
        'email': _email.text.trim(),
        'role_slug': _role,
        if (_name.text.isNotEmpty) 'name': _name.text.trim(),
        if (_phone.text.isNotEmpty) 'phone': _phone.text.trim(),
        if (_pass.text.isNotEmpty) 'password': _pass.text,
      };
      Navigator.pop(context, data);
    } catch (_) {}
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: _isEdit ? 'Редактировать сотрудника' : 'Новый сотрудник',
    submitLabel: _isEdit ? 'Сохранить' : 'Создать',
    onSubmit: _submit,
    loading: _saving,
    fields: [
      mField('Имя', _name, hint: 'Иван Иванов'),
      mField('Email *', _email, keyboard: TextInputType.emailAddress),
      mField('Телефон', _phone, keyboard: TextInputType.phone),
      mField(
        _isEdit ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль * (мин. 8 симв.)',
        _pass, obscure: true,
      ),
      mDropdown<String>('Роль', _role,
        _roles.map((r) => DropdownMenuItem(value: r.$1, child: Text(r.$2))).toList(),
        (v) => setState(() => _role = v ?? 'waiter')),
    ],
  );
}
