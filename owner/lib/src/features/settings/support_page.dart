import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../ui/kit.dart';

/// Support request (web SupportWidget): phone + message → /support/tickets.
class SupportPage extends StatefulWidget {
  const SupportPage({super.key});
  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  final phone = TextEditingController(text: '+998');
  final message = TextEditingController();
  bool busy = false;
  bool sent = false;

  Future<void> _send() async {
    if (busy) return;
    if (message.text.trim().isEmpty) {
      toast(context, 'Опишите проблему', error: true);
      return;
    }
    setState(() => busy = true);
    try {
      await Api.i.post('/support/tickets', data: {'phone': phone.text.trim(), 'message': message.text.trim()});
      if (mounted) setState(() => sent = true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Тех. поддержка')),
        body: sent
            ? const EmptyState('Сообщение отправлено. Мы свяжемся с вами.', icon: Icons.check_circle_outline)
            : ListView(padding: const EdgeInsets.all(16), children: [
                Labeled('Ваш телефон', TextField(controller: phone, keyboardType: TextInputType.phone)),
                const SizedBox(height: 14),
                Labeled('Сообщение', TextField(controller: message, maxLines: 6, decoration: const InputDecoration(hintText: 'Опишите проблему или вопрос'))),
                const SizedBox(height: 20),
                BusyButton(label: 'Отправить', busy: busy, onPressed: _send),
              ]),
      );
}
