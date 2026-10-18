import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../../ui/records.dart';
import 'role_permissions_pages.dart';

const staffRoles = {
  'cashier': 'Кассир',
  'waiter': 'Официант',
  'courier': 'Курьер',
  'monoblock': 'Моноблок',
  'kitchen': 'Кухня',
  'manager': 'Менеджер',
  'warehouse': 'Завсклад',
};

String roleLabel(String? slug) => staffRoles[slug] ?? (slug == 'owner' ? 'Владелец' : slug == 'admin' ? 'Администратор' : '${slug ?? '—'}');
String _slug(Json u) => '${u['role_slug'] ?? ((u['role_slugs'] as List?)?.firstOrNull ?? '')}';

/// Employees grouped by role (as in the web sidebar "Сотрудники").
class StaffPage extends StatefulWidget {
  const StaffPage({super.key, this.initialRole = 'all'});
  final String initialRole;
  @override
  State<StaffPage> createState() => _StaffPageState();
}

class _StaffPageState extends State<StaffPage> {
  late String role = widget.initialRole;
  List<Json> users = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      users = asJsonList(await Api.i.get('/auth/users'));
      error = null;
    } on ApiError catch (e) {
      error = e.message;
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _edit(Json? u) async {
    final ok = await push<bool>(context, StaffForm(user: u, defaultRole: role == 'all' ? 'cashier' : role));
    if (ok == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final shown = users.where((u) => role == 'all' || _slug(u) == role).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Сотрудники'), actions: [
        IconBtn(icon: Icons.admin_panel_settings_outlined, tooltip: 'Права доступа', onTap: () => push(context, const RolePermissionsPage())),
        IconBtn(icon: Icons.history, tooltip: 'История входа', onTap: () => push(context, const StaffActivityPage(type: 'login-history'))),
        IconBtn(icon: Icons.event_available_outlined, tooltip: 'Посещаемость', onTap: () => push(context, const StaffActivityPage(type: 'attendance'))),
      ]),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => _edit(null), icon: const Icon(Icons.person_add_alt_1), label: const Text('Добавить')),
      body: Column(children: [
        ChipTabs(items: {'all': 'Все', ...staffRoles}, value: role, onChanged: (v) => setState(() => role = v)),
        Expanded(
          child: loading && users.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : error != null && users.isEmpty
                  ? ErrorState('Не удалось загрузить: $error', onRetry: _load)
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: shown.isEmpty
                          ? ListView(children: const [SizedBox(height: 300, child: EmptyState('Сотрудников пока нет', icon: Icons.groups_outlined))])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                              itemCount: shown.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (_, i) {
                                final u = shown[i];
                                final name = '${u['name'] ?? u['phone'] ?? u['email'] ?? '—'}';
                                final locked = _slug(u) == 'owner' || _slug(u) == 'admin';
                                return Card2(
                                  onTap: locked ? null : () => _edit(u),
                                  child: Row(children: [
                                    Avatar(name, size: 42),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                        Text(name, style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                        Text([roleLabel(_slug(u)), if (u['phone'] != null) '${u['phone']}'].join(' · '), style: MT.small),
                                      ]),
                                    ),
                                    if (u['is_active'] == false) Pill('Архив', bg: MC.n100, fg: MC.n600) else if (locked) const Icon(Icons.lock_outline, size: 18, color: MC.n400) else const Icon(Icons.chevron_right, color: MC.n300),
                                  ]),
                                );
                              },
                            ),
                    ),
        ),
      ]),
    );
  }
}

class StaffForm extends StatefulWidget {
  const StaffForm({super.key, this.user, this.defaultRole = 'cashier'});
  final Json? user;
  final String defaultRole;
  @override
  State<StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends State<StaffForm> {
  late final name = TextEditingController(text: '${widget.user?['name'] ?? ''}');
  late final phone = TextEditingController(text: '${widget.user?['phone'] ?? ''}');
  final password = TextEditingController();
  final pin = TextEditingController();
  late String role = staffRoles.containsKey(widget.user == null ? null : _slug(widget.user!)) ? _slug(widget.user!) : widget.defaultRole;
  late bool active = widget.user?['is_active'] != false;
  bool busy = false;

  bool get isNew => widget.user == null;

  Future<void> _save() async {
    if (busy) return;
    final p = pin.text.replaceAll(RegExp(r'\D'), '');
    if (isNew && password.text.length < 8) {
      toast(context, 'Пароль — минимум 8 символов', error: true);
      return;
    }
    if (p.isNotEmpty && (p.length < 4 || p.length > 8)) {
      toast(context, 'PIN должен содержать от 4 до 8 цифр', error: true);
      return;
    }
    setState(() => busy = true);
    try {
      final ph = phone.text.trim();
      String id;
      if (isNew) {
        final created = asJson(await Api.i.post('/auth/users', data: {'password': password.text, 'phone': ph.isEmpty ? null : ph, 'role_slug': role}));
        id = '${created['id']}';
        await Api.i.patch('/auth/users/$id', data: {if (name.text.trim().isNotEmpty) 'name': name.text.trim(), 'is_active': active});
      } else {
        id = '${widget.user!['id']}';
        await Api.i.patch('/auth/users/$id', data: {
          'name': name.text.trim(),
          'phone': ph.isEmpty ? null : ph,
          'role_slug': role,
          'is_active': active,
          if (password.text.isNotEmpty) 'password': password.text,
        });
      }
      if (p.isNotEmpty) await Api.i.patch('/auth/users/$id/pin', data: {'pin': p});
      if (mounted) {
        toast(context, 'Сохранено');
        Navigator.of(context).pop(true);
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _archive() async {
    if (!await confirm(context, 'Архивировать сотрудника?', action: 'Архивировать')) return;
    try {
      await Api.i.delete('/auth/users/${widget.user!['id']}');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(isNew ? 'Новый сотрудник' : 'Сотрудник'), actions: [if (!isNew) IconBtn(icon: Icons.archive_outlined, onTap: _archive, tooltip: 'Архивировать')]),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Labeled('Имя', TextField(controller: name, textCapitalization: TextCapitalization.words)),
          const SizedBox(height: 14),
          Labeled('Телефон (логин)', TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '+998901234567'))),
          const SizedBox(height: 14),
          Labeled('Роль', DropdownButtonFormField<String>(initialValue: role, items: [for (final e in staffRoles.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => role = v ?? role))),
          const SizedBox(height: 14),
          Labeled(isNew ? 'Пароль' : 'Новый пароль', TextField(controller: password, obscureText: true, decoration: InputDecoration(hintText: isNew ? 'Минимум 8 символов' : 'Оставьте пустым, чтобы не менять'))),
          const SizedBox(height: 14),
          Labeled('PIN-код (для входа на кассе)', TextField(controller: pin, keyboardType: TextInputType.number, maxLength: 8, obscureText: true, decoration: InputDecoration(hintText: isNew ? '4–8 цифр' : 'Оставьте пустым, чтобы не менять'))),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Активен'), value: active, onChanged: (v) => setState(() => active = v)),
          const SizedBox(height: 12),
          BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
        ]),
      );
}

/// Login history and attendance journals.
class StaffActivityPage extends StatelessWidget {
  const StaffActivityPage({super.key, required this.type});
  final String type;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(type == 'attendance' ? 'Посещаемость' : 'История входа')),
        body: AsyncBody<List<Json>>(
          load: () async => asJsonList(await Api.i.get('/hr/$type')),
          builder: (_, rows, reload) => RefreshIndicator(onRefresh: reload, child: RecordCards(rows, titleKey: 'employee')),
        ),
      );
}
