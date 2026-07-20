import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late TextEditingController _name, _phone;
  final _oldPass  = TextEditingController();
  final _newPass  = TextEditingController();
  final _confPass = TextEditingController();
  bool _saving = false;
  bool _showOld = false, _showNew = false, _showConf = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AppState>().user ?? {};
    _name  = TextEditingController(text: user['name']?.toString() ?? '');
    _phone = TextEditingController(text: user['phone']?.toString() ?? '');
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _oldPass, _newPass, _confPass]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final newPass = _newPass.text;
    if (newPass.isNotEmpty) {
      if (newPass.length < 8) {
        showSnack(context, 'Пароль — минимум 8 символов', error: true);
        return;
      }
      if (newPass != _confPass.text) {
        showSnack(context, 'Пароли не совпадают', error: true);
        return;
      }
    }

    setState(() => _saving = true);
    try {
      final state  = context.read<AppState>();
      final userId = state.user?['id']?.toString();
      if (userId == null) throw Exception('Нет ID пользователя');

      final data = <String, dynamic>{
        if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
        if (newPass.isNotEmpty) 'password': newPass,
      };
      await Api().updateUser(userId, data);

      await state.init();
      if (!mounted) return;
      _oldPass.clear();
      _newPass.clear();
      _confPass.clear();
      showSnack(context, 'Профиль сохранён');
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppState>().user ?? {};
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(title: const Text('Мой профиль')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          // Avatar
          Center(
            child: Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: T.accent.withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(color: T.accent, width: 2),
              ),
              child: Center(
                child: Text(
                  _initials(user),
                  style: const TextStyle(
                    fontSize: 28, fontWeight: FontWeight.bold, color: T.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              user['email']?.toString() ?? '',
              style: const TextStyle(color: T.muted, fontSize: 13),
            ),
          ),
          const SizedBox(height: 28),
          _sectionLabel('Личные данные'),
          mField('Имя', _name, hint: 'Иван Иванов'),
          const SizedBox(height: 12),
          mField('Телефон', _phone,
            keyboard: TextInputType.phone, hint: '+998 90 123 45 67'),
          const SizedBox(height: 28),
          _sectionLabel('Смена пароля'),
          _passField('Текущий пароль', _oldPass, _showOld,
            () => setState(() => _showOld = !_showOld)),
          const SizedBox(height: 12),
          _passField('Новый пароль (мин. 8 символов)', _newPass, _showNew,
            () => setState(() => _showNew = !_showNew)),
          const SizedBox(height: 12),
          _passField('Повторите новый пароль', _confPass, _showConf,
            () => setState(() => _showConf = !_showConf)),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Сохранить',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            icon: const Icon(Icons.logout, color: T.danger, size: 18),
            label: const Text('Выйти из аккаунта',
              style: TextStyle(color: T.danger)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: T.danger),
              padding: const EdgeInsets.symmetric(vertical: 14)),
            onPressed: () async {
              final ok = await confirmDialog(context,
                title: 'Выйти?', message: 'Вы выйдете из аккаунта');
              if (ok && context.mounted) {
                context.read<AppState>().logout();
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(t.toUpperCase(), style: const TextStyle(
      fontSize: 11, fontWeight: FontWeight.w700,
      color: T.muted, letterSpacing: 1.1)),
  );

  Widget _passField(String label, TextEditingController ctrl,
      bool visible, VoidCallback toggle) {
    return TextField(
      controller: ctrl,
      obscureText: !visible,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: IconButton(
          icon: Icon(visible ? Icons.visibility_off : Icons.visibility,
            color: T.muted, size: 18),
          onPressed: toggle,
        ),
      ),
    );
  }

  String _initials(Map<String, dynamic> user) {
    final name = user['name']?.toString() ?? '';
    if (name.isNotEmpty) {
      final parts = name.trim().split(' ');
      if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      return name[0].toUpperCase();
    }
    final email = user['email']?.toString() ?? '?';
    return email[0].toUpperCase();
  }
}
