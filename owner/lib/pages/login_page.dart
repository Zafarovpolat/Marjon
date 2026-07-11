import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/app_state.dart';
import '../core/theme.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _server = TextEditingController(text: 'http://192.168.1.100:8000/api/v1');
  final _login = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((sp) {
      final s = sp.getString('server_url');
      if (s != null && mounted) setState(() => _server.text = s);
    });
  }

  Future<void> _submit() async {
    if (_login.text.trim().isEmpty || _pass.text.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      await context.read<AppState>().login(_server.text.trim(), _login.text.trim(), _pass.text);
    } catch (e) {
      setState(() => _error = 'Неверный логин или пароль');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 380), child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.store, size: 64, color: T.accent),
            const SizedBox(height: 8),
            const Text('Marjon Owner', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: T.accent)),
            const SizedBox(height: 4),
            const Text('Панель управления', style: TextStyle(color: T.muted)),
            const SizedBox(height: 32),
            TextField(controller: _server, decoration: const InputDecoration(labelText: 'Адрес сервера')),
            const SizedBox(height: 12),
            TextField(controller: _login, decoration: const InputDecoration(labelText: 'Email или телефон', hintText: 'admin@marjon.uz')),
            const SizedBox(height: 12),
            TextField(controller: _pass, obscureText: true, decoration: const InputDecoration(labelText: 'Пароль'), onSubmitted: (_) => _submit()),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: T.danger))),
            const SizedBox(height: 20),
            SizedBox(width: double.infinity, child: ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Войти'),
            )),
          ],
        )),
      )),
    );
  }
}
