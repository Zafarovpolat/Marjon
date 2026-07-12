import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class StaffPage extends StatefulWidget {
  const StaffPage({super.key});
  @override
  State<StaffPage> createState() => _StaffPageState();
}

class _StaffPageState extends State<StaffPage> {
  List<dynamic> _users = [];
  List<dynamic> _branches = [];
  bool _loading = true;

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
  void initState() {
    super.initState();
    _load();
  }

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

  Future<void> _addUser() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      backgroundColor: T.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _StaffForm(branches: _branches),
    );
    if (result == null) return;
    try {
      await Api().createUser(result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Сотрудник создан'), backgroundColor: T.success));
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: T.danger));
      }
    }
  }

  Future<void> _deleteUser(Map<String, dynamic> user) async {
    final name = user['email'] ?? user['name'] ?? 'сотрудника';
    final confirm = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: T.surface,
      title: const Text('Удалить сотрудника?'),
      content: Text('$name будет деактивирован'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: T.danger),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Удалить'),
        ),
      ],
    ));
    if (confirm != true) return;
    try {
      await Api().deleteUser(user['id']);
      _load();
    } catch (_) {}
  }

  String _roleLabel(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    if (slugs.isEmpty) return 'Нет роли';
    return slugs.map((s) => _roleLabels[s] ?? s).join(', ');
  }

  Color _roleColor(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    if (slugs.isEmpty) return T.muted;
    return _roleColors[slugs.first] ?? T.muted;
  }

  IconData _roleIcon(dynamic user) {
    final slugs = (user['role_slugs'] as List?)?.cast<String>() ?? [];
    if (slugs.isEmpty) return Icons.person;
    return _roleIcons[slugs.first] ?? Icons.person;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Сотрудники'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addUser,
        child: const Icon(Icons.person_add),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _users.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.people_outline, size: 56, color: T.muted),
                  const SizedBox(height: 12),
                  const Text('Нет сотрудников', style: TextStyle(color: T.muted, fontSize: 16)),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: _addUser,
                    icon: const Icon(Icons.person_add),
                    label: const Text('Добавить первого'),
                  ),
                ]))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                  itemCount: _users.length,
                  itemBuilder: (_, i) {
                    final u = _users[i];
                    final color = _roleColor(u);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: T.surface, borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: T.border, width: 0.5),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                        leading: Container(
                          width: 44, height: 44, alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(_roleIcon(u), color: color, size: 22),
                        ),
                        title: Text(
                          u['name'] ?? u['email'] ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(u['email'] ?? '', style: const TextStyle(color: T.muted, fontSize: 13)),
                          if (u['phone'] != null)
                            Text(u['phone'], style: const TextStyle(color: T.muted, fontSize: 12)),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              _roleLabel(u),
                              style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ]),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline, color: T.danger, size: 20),
                          onPressed: () => _deleteUser(u),
                        ),
                        isThreeLine: true,
                      ),
                    );
                  },
                ),
          ),
    );
  }
}

class _StaffForm extends StatefulWidget {
  final List<dynamic> branches;
  const _StaffForm({required this.branches});
  @override
  State<_StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends State<_StaffForm> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _phone = TextEditingController();
  final _name = TextEditingController();
  String _role = 'waiter';

  static const _roles = [
    ('cashier', 'Кассир'), ('waiter', 'Официант'),
    ('kitchen', 'Повар'), ('bar', 'Бармен'),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Новый сотрудник', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Имя')),
        const SizedBox(height: 10),
        TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email *'),
          keyboardType: TextInputType.emailAddress),
        const SizedBox(height: 10),
        TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Телефон'),
          keyboardType: TextInputType.phone),
        const SizedBox(height: 10),
        TextField(controller: _pass,
          decoration: const InputDecoration(labelText: 'Пароль * (мин. 8 симв., буква + цифра)'),
          obscureText: true),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          value: _role,
          decoration: const InputDecoration(labelText: 'Роль'),
          dropdownColor: T.surface,
          items: _roles.map((r) => DropdownMenuItem(value: r.$1, child: Text(r.$2))).toList(),
          onChanged: (v) => setState(() => _role = v!),
        ),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () {
            if (_email.text.isEmpty || _pass.text.isEmpty) return;
            Navigator.pop(context, {
              'email': _email.text.trim(),
              'password': _pass.text,
              'phone': _phone.text.isNotEmpty ? _phone.text.trim() : null,
              'name': _name.text.isNotEmpty ? _name.text.trim() : null,
              'role_slug': _role,
            });
          },
          child: const Text('Создать'),
        )),
      ]),
    );
  }
}
