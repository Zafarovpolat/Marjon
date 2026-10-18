import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../net/api.dart';
import '../../session.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../settings/privacy_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final login = TextEditingController();
  final pass = TextEditingController();
  bool busy = false;
  bool hide = true;
  String error = '';

  Future<void> _submit() async {
    if (login.text.trim().isEmpty || pass.text.isEmpty) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await context.read<Session>().login(login.text.trim(), pass.text);
    } on ApiError catch (e) {
      setState(() => error = e.network ? e.message : (e.status == 401 || e.status == 403 || e.status == 400 ? 'Неверный логин или пароль' : e.message));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: MarjonBackdrop(
          child: SafeArea(
            child: AuthCard(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(child: Image.asset('assets/images/logo_mark.png', width: 56, height: 56)),
                const SizedBox(height: 12),
                Text('Marjon Owner', textAlign: TextAlign.center, style: MT.h1.copyWith(color: MC.teal600)),
                const SizedBox(height: 4),
                Text('Панель управления рестораном', textAlign: TextAlign.center, style: MT.bodyMuted),
                const SizedBox(height: 22),
                Labeled('Телефон или email', TextField(controller: login, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(hintText: '+998 90 111 22 33'))),
                const SizedBox(height: 14),
                Labeled(
                  'Пароль',
                  TextField(
                    controller: pass,
                    obscureText: hide,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(suffixIcon: IconButton(icon: Icon(hide ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => hide = !hide))),
                  ),
                ),
                if (error.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: MC.red100, borderRadius: BorderRadius.circular(MC.rMd)), child: Text(error, style: MT.body.copyWith(color: MC.red600, fontSize: 14))),
                ],
                const SizedBox(height: 18),
                BusyButton(label: 'Войти', busy: busy, onPressed: _submit),
                const SizedBox(height: 8),
                TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PrivacyPage())), child: const Text('Политика конфиденциальности')),
              ]),
            ),
          ),
        ),
      );
}
