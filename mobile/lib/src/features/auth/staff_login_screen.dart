import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../session/session.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import 'server_dialog.dart';

/// Personal-device sign-in: the employee's own phone + password logs them
/// straight into their workplace — no shared terminal, no employee picker, no PIN.
class StaffLoginScreen extends StatefulWidget {
  const StaffLoginScreen({super.key});
  @override
  State<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends State<StaffLoginScreen> {
  final _phone = TextEditingController(text: '+998');
  final _password = TextEditingController();
  bool _show = false;
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final digits = extractPhoneDigits(_phone.text);
    if (!isPhoneComplete(digits)) {
      setState(() => _error = t('lp_phone_incomplete'));
      return;
    }
    if (_password.text.isEmpty) {
      setState(() => _error = t('lp_bad_creds'));
      return;
    }
    setState(() {
      _error = '';
      _busy = true;
    });
    final session = context.read<Session>();
    try {
      await session.login(fullPhone(digits), _password.text);
    } on ApiError catch (e) {
      if (mounted) {
        setState(() => _error = e.network ? e.message : (e.status == 401 ? t('lp_bad_creds') : e.message));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        resizeToAvoidBottomInset: true,
        body: MarjonBackdrop(
          child: SafeArea(
            child: Stack(children: [
              AuthCard(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('MARJON', style: MT.brand),
                  const SizedBox(height: 4),
                  Text(t('lp_staff_subtitle'), style: MT.bodyMuted.copyWith(fontSize: 16)),
                  const SizedBox(height: 22),
                  Labeled(
                    t('lp_phone'),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [PhoneInputFormatter()],
                      autocorrect: false,
                      style: MT.body.copyWith(fontSize: 17),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Labeled(
                    t('lp_password'),
                    TextField(
                      controller: _password,
                      obscureText: !_show,
                      autocorrect: false,
                      enableSuggestions: false,
                      onSubmitted: (_) => _submit(),
                      style: MT.body.copyWith(fontSize: 17),
                      decoration: InputDecoration(
                        suffixIcon: IconButton(
                          icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: MC.n500),
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                    ),
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: MC.red100, borderRadius: BorderRadius.circular(MC.rMd)),
                      child: Text(_error, style: MT.body.copyWith(color: MC.red600, fontSize: 14)),
                    ),
                  ],
                  const SizedBox(height: 18),
                  BusyButton(label: _busy ? t('lp_logging_in') : t('enter'), busy: _busy, onPressed: _submit),
                ]),
              ),
              Positioned(
                right: 8,
                top: 4,
                child: IconBtn(icon: Icons.dns_outlined, color: Colors.white70, tooltip: t('srv_setup'), onTap: () => showServerDialog(context)),
              ),
            ]),
          ),
        ),
      );
}
