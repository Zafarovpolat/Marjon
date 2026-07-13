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
  final _serverCtrl = TextEditingController(text: 'http://192.168.1.100:8000/api/v1');
  final _loginCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((sp) {
      final saved = sp.getString('server_url');
      if (saved != null && mounted) setState(() => _serverCtrl.text = saved);
    });
  }

  Future<void> _submit() async {
    if (_loginCtrl.text.trim().isEmpty || _passCtrl.text.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      await context.read<AppState>().login(
        _serverCtrl.text.trim(),
        _loginCtrl.text.trim(),
        _passCtrl.text,
      );
    } catch (e) {
      setState(() => _error = 'Неверный логин или пароль');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Marjon', style: TextStyle(
                  fontSize: 36, fontWeight: FontWeight.bold,
                  color: AppTheme.accent,
                )),
                const SizedBox(height: 4),
                const Text('Терминал', style: TextStyle(color: AppTheme.textMuted)),
                const SizedBox(height: 32),

                TextField(
                  controller: _serverCtrl,
                  decoration: const InputDecoration(labelText: 'Адрес сервера'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _loginCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Email или телефон',
                    hintText: '+998901234567',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Пароль'),
                  onSubmitted: (_) => _submit(),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 14)),
                ],

                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(height: 20, width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Войти', style: TextStyle(fontSize: 16)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
