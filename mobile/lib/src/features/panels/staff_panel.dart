import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../floor/floor_data.dart';

const _assignable = ['cashier', 'waiter', 'kitchen', 'monoblock', 'courier', 'warehouse'];

List<String> _slugs(Json u) => ((u['role_slugs'] as List?)?.map((e) => '$e').toList()) ?? ['${u['role_slug'] ?? ''}'];
bool _isAdminRow(Json u) => _slugs(u).any((s) => s == 'owner' || s == 'admin');

/// Staff management from the "⋮" menu: name, phone, role, PIN, active. Port of StaffManagerPanel.
class StaffPanel extends StatefulWidget {
  const StaffPanel({super.key});
  @override
  State<StaffPanel> createState() => _StaffPanelState();
}

class _StaffPanelState extends State<StaffPanel> {
  List<Json> users = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      users = asJsonList(await Api.i.users());
    } catch (_) {
      users = [];
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _edit(Json? u) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _StaffForm(user: u)));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(t('dev_staff')), actions: [IconBtn(icon: Icons.person_add_alt_1, onTap: () => _edit(null), tooltip: t('staff_add'))]),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : users.isEmpty
                ? EmptyState(t('emp_empty'), icon: Icons.groups_outlined)
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: users.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final u = users[i];
                      final locked = _isAdminRow(u);
                      final inactive = u['is_active'] == false;
                      return Card2(
                        onTap: locked ? null : () => _edit(u),
                        child: Row(children: [
                          Avatar('${u['name'] ?? ''}', size: 42),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${u['name'] ?? '—'}', style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                              Text('${tRole('${u['role_slug'] ?? ''}')}${inactive ? ' · ${t('staff_inactive')}' : ''}', style: MT.small),
                            ]),
                          ),
                          if (locked) Pill(t('staff_readonly'), icon: Icons.lock_outline) else const Icon(Icons.edit_outlined, color: MC.n400, size: 20),
                        ]),
                      );
                    },
                  ),
      );
}

class _StaffForm extends StatefulWidget {
  const _StaffForm({this.user});
  final Json? user;
  @override
  State<_StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends State<_StaffForm> {
  late final name = TextEditingController(text: '${widget.user?['name'] ?? ''}');
  late final phone = TextEditingController(text: '${widget.user?['phone'] ?? ''}');
  final pin = TextEditingController();
  final password = TextEditingController();
  late String role = _assignable.contains(widget.user?['role_slug']) ? '${widget.user!['role_slug']}' : 'cashier';
  late bool active = widget.user?['is_active'] != false;
  bool saving = false;

  bool get isNew => widget.user == null;

  Future<void> _save() async {
    if (saving) return;
    if (name.text.trim().isEmpty) {
      toast(context, t('required_fields'), error: true);
      return;
    }
    final p = pin.text.replaceAll(RegExp(r'D'), '');
    if (isNew && password.text.length < 4) {
      toast(context, 'Пароль — минимум 4 символа', error: true);
      return;
    }
    if (p.isNotEmpty && (p.length < 4 || p.length > 8)) {
      toast(context, t('staff_pin_invalid'), error: true);
      return;
    }
    final ph = phone.text.trim().isEmpty ? null : phone.text.trim();
    setState(() => saving = true);
    try {
      String id;
      if (isNew) {
        final created = await Api.i.createUser({'password': password.text, 'phone': ph, 'role_slug': role});
        id = '${(created as Map)['id']}';
        await Api.i.updateUser(id, {'name': name.text.trim(), 'is_active': active});
      } else {
        id = '${widget.user!['id']}';
        await Api.i.updateUser(id, {'name': name.text.trim(), 'phone': ph, 'role_slug': role, 'is_active': active, if (password.text.isNotEmpty) 'password': password.text});
      }
      if (p.isNotEmpty) await Api.i.patch('/auth/users/$id/pin', data: {'pin': p});
      if (mounted) {
        toast(context, t('saved'));
        Navigator.of(context).pop(true);
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message.isEmpty ? t('save_failed') : e.message, error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(isNew ? t('staff_add') : t('edit'))),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Labeled(t('staff_name'), TextField(controller: name, maxLength: 120)),
          Labeled(t('staff_phone'), TextField(controller: phone, keyboardType: TextInputType.phone, maxLength: 30)),
          Labeled(
            t('staff_role'),
            DropdownButtonFormField<String>(
              initialValue: role,
              items: [for (final r in _assignable) DropdownMenuItem(value: r, child: Text(tRole(r)))],
              onChanged: (v) => setState(() => role = v ?? role),
            ),
          ),
          const SizedBox(height: 14),
          Labeled(isNew ? 'Пароль' : 'Новый пароль', TextField(controller: password, obscureText: true, decoration: InputDecoration(hintText: isNew ? 'Минимум 4 символа' : 'Оставьте пустым, чтобы не менять'))),
          const SizedBox(height: 14),
          Labeled(t('staff_pin'), TextField(controller: pin, keyboardType: TextInputType.number, maxLength: 8, obscureText: true, decoration: InputDecoration(hintText: isNew ? '' : t('staff_pin_keep')))),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('staff_active')), value: active, onChanged: (v) => setState(() => active = v)),
          const SizedBox(height: 12),
          BusyButton(label: t('save'), busy: saving, onPressed: _save),
        ]),
      );
}
