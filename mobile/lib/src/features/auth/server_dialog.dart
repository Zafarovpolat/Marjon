import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/store.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';

/// Server address (cloud by default) and the optional LAN desktop proxy.
Future<void> showServerDialog(BuildContext context) => showDialog<void>(
      context: context,
      builder: (_) => const _ServerDialog(),
    );

class _ServerDialog extends StatefulWidget {
  const _ServerDialog();
  @override
  State<_ServerDialog> createState() => _ServerDialogState();
}

class _ServerDialogState extends State<_ServerDialog> {
  final _url = TextEditingController(text: Store.serverUrl ?? Store.cloudUrl);
  final _ip = TextEditingController(text: Store.localDesktopIp ?? '');
  final _tok = TextEditingController(text: Store.localDesktopToken ?? '');

  @override
  void dispose() {
    _url.dispose();
    _ip.dispose();
    _tok.dispose();
    super.dispose();
  }

  void _save() {
    final url = _url.text.trim();
    Store.serverUrl = url == Store.cloudUrl ? null : url;
    Store.localDesktopIp = _ip.text.trim();
    Store.localDesktopToken = _tok.text.trim();
    Navigator.pop(context);
    toast(context, t('saved'));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(t('srv_setup')),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Labeled(t('s_server_addr'), TextField(controller: _url, keyboardType: TextInputType.url, autocorrect: false)),
            const SizedBox(height: 16),
            Text('LAN', style: MT.label),
            const SizedBox(height: 6),
            TextField(controller: _ip, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: '192.168.0.10')),
            const SizedBox(height: 8),
            TextField(controller: _tok, decoration: const InputDecoration(hintText: 'X-Local-Token')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(t('cancel'))),
          TextButton(onPressed: _save, child: Text(t('save'))),
        ],
      );
}
