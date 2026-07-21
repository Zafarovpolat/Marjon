import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/theme.dart';

class PaymentSettingsPage extends StatefulWidget {
  const PaymentSettingsPage({super.key});

  @override
  State<PaymentSettingsPage> createState() => _PaymentSettingsPageState();
}

class _PaymentSettingsPageState extends State<PaymentSettingsPage> {
  bool _loading = true;
  bool _saving = false;
  String? _error;

  // Payme
  bool _paymeEnabled = false;
  final _paymeId  = TextEditingController();
  final _paymeKey = TextEditingController();
  bool _paymeKeyVisible = false;

  // Click
  bool _clickEnabled = false;
  final _clickMerchantId = TextEditingController();
  final _clickServiceId  = TextEditingController();
  final _clickSecret     = TextEditingController();
  bool _clickSecretVisible = false;

  // Uzum (reserved)
  bool _uzumEnabled = false;
  final _uzumStoreId = TextEditingController();
  final _uzumKey     = TextEditingController();
  bool _uzumKeyVisible = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _paymeId.dispose();
    _paymeKey.dispose();
    _clickMerchantId.dispose();
    _clickServiceId.dispose();
    _clickSecret.dispose();
    _uzumStoreId.dispose();
    _uzumKey.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await Api().gatewaySettings();
      setState(() {
        _paymeEnabled  = data['payme_enabled'] ?? false;
        _paymeId.text  = data['payme_merchant_id'] ?? '';
        // payme_key is write-only, never returned from server

        _clickEnabled         = data['click_enabled'] ?? false;
        _clickMerchantId.text = data['click_merchant_id'] ?? '';
        _clickServiceId.text  = data['click_service_id'] ?? '';
        // click_secret_key is write-only

        _uzumEnabled      = data['uzum_enabled'] ?? false;
        _uzumStoreId.text = data['uzum_store_id'] ?? '';
        // uzum_key is write-only
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final data = <String, dynamic>{
      'payme_enabled':     _paymeEnabled,
      'payme_merchant_id': _paymeId.text.trim().isEmpty ? null : _paymeId.text.trim(),
      if (_paymeKey.text.trim().isNotEmpty) 'payme_key': _paymeKey.text.trim(),

      'click_enabled':     _clickEnabled,
      'click_merchant_id': _clickMerchantId.text.trim().isEmpty ? null : _clickMerchantId.text.trim(),
      'click_service_id':  _clickServiceId.text.trim().isEmpty  ? null : _clickServiceId.text.trim(),
      if (_clickSecret.text.trim().isNotEmpty) 'click_secret_key': _clickSecret.text.trim(),

      'uzum_enabled':  _uzumEnabled,
      'uzum_store_id': _uzumStoreId.text.trim().isEmpty ? null : _uzumStoreId.text.trim(),
      if (_uzumKey.text.trim().isNotEmpty) 'uzum_key': _uzumKey.text.trim(),
    };

    setState(() { _saving = true; _error = null; });
    try {
      await Api().saveGatewaySettings(data);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Настройки сохранены'), backgroundColor: Colors.green),
        );
        // Clear key fields after successful save (write-only)
        _paymeKey.clear();
        _clickSecret.clear();
        _uzumKey.clear();
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        backgroundColor: T.surface,
        foregroundColor: T.text,
        elevation: 0,
        title: const Text('Платёжные шлюзы', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  _ErrorBanner(_error!, onDismiss: () => setState(() => _error = null)),

                _GatewayCard(
                  title: 'Payme',
                  subtitle: 'paycom.uz — через личный кабинет мерчанта',
                  logoAsset: null,
                  logoEmoji: '💳',
                  enabled: _paymeEnabled,
                  onToggle: (v) => setState(() => _paymeEnabled = v),
                  children: [
                    _field('Merchant ID', _paymeId,
                        hint: 'Из личного кабинета Payme',
                        enabled: _paymeEnabled),
                    const SizedBox(height: 12),
                    _secretField('API Key', _paymeKey, _paymeKeyVisible,
                        hint: 'Оставьте пустым, чтобы не менять',
                        onToggle: () => setState(() => _paymeKeyVisible = !_paymeKeyVisible),
                        enabled: _paymeEnabled),
                    if (_paymeEnabled)
                      _CallbackNote(
                        label: 'Callback URL для Payme',
                        value: 'https://ваш-сервер:8001/payme/{company_id}/callback',
                      ),
                  ],
                ),

                const SizedBox(height: 16),

                _GatewayCard(
                  title: 'Click',
                  subtitle: 'click.uz — интеграция Shop API',
                  logoAsset: null,
                  logoEmoji: '🔵',
                  enabled: _clickEnabled,
                  onToggle: (v) => setState(() => _clickEnabled = v),
                  children: [
                    _field('Merchant ID', _clickMerchantId,
                        hint: 'ID мерчанта в Click',
                        enabled: _clickEnabled),
                    const SizedBox(height: 12),
                    _field('Service ID', _clickServiceId,
                        hint: 'ID сервиса в Click',
                        keyboardType: TextInputType.number,
                        enabled: _clickEnabled),
                    const SizedBox(height: 12),
                    _secretField('Secret Key', _clickSecret, _clickSecretVisible,
                        hint: 'Оставьте пустым, чтобы не менять',
                        onToggle: () => setState(() => _clickSecretVisible = !_clickSecretVisible),
                        enabled: _clickEnabled),
                    if (_clickEnabled) ...[
                      _CallbackNote(
                        label: 'Prepare URL',
                        value: 'https://ваш-сервер:8002/click/{company_id}/prepare',
                      ),
                      const SizedBox(height: 4),
                      _CallbackNote(
                        label: 'Complete URL',
                        value: 'https://ваш-сервер:8002/click/{company_id}/complete',
                      ),
                    ],
                  ],
                ),

                const SizedBox(height: 16),

                _GatewayCard(
                  title: 'Uzum Bank',
                  subtitle: 'uzumbank.uz — будет доступно в v1.1',
                  logoAsset: null,
                  logoEmoji: '🟣',
                  enabled: _uzumEnabled,
                  onToggle: (v) => setState(() => _uzumEnabled = v),
                  children: [
                    _field('Store ID', _uzumStoreId,
                        hint: 'ID магазина в Uzum Bank',
                        enabled: _uzumEnabled),
                    const SizedBox(height: 12),
                    _secretField('API Key', _uzumKey, _uzumKeyVisible,
                        hint: 'Оставьте пустым, чтобы не менять',
                        onToggle: () => setState(() => _uzumKeyVisible = !_uzumKeyVisible),
                        enabled: _uzumEnabled),
                  ],
                ),

                const SizedBox(height: 32),

                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: T.accent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _saving
                        ? const SizedBox(
                            width: 22, height: 22,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Сохранить', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
    );
  }

  Widget _field(
    String label, TextEditingController ctrl, {
    String? hint,
    bool enabled = true,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: T.muted, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          enabled: enabled,
          keyboardType: keyboardType,
          style: TextStyle(color: T.text, fontSize: 14),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: T.muted.withValues(alpha:0.5), fontSize: 13),
            filled: true,
            fillColor: enabled ? T.bg : T.bg.withValues(alpha:0.5),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.2)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.2)),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.1)),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
      ],
    );
  }

  Widget _secretField(
    String label, TextEditingController ctrl, bool visible, {
    String? hint,
    required VoidCallback onToggle,
    bool enabled = true,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: T.muted, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          enabled: enabled,
          obscureText: !visible,
          style: TextStyle(color: T.text, fontSize: 14),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: T.muted.withValues(alpha:0.5), fontSize: 13),
            filled: true,
            fillColor: enabled ? T.bg : T.bg.withValues(alpha:0.5),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.2)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.2)),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: T.muted.withValues(alpha:0.1)),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            suffixIcon: IconButton(
              onPressed: enabled ? onToggle : null,
              icon: Icon(
                visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                color: T.muted,
                size: 20,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _GatewayCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String? logoAsset;
  final String? logoEmoji;
  final bool enabled;
  final ValueChanged<bool> onToggle;
  final List<Widget> children;

  const _GatewayCard({
    required this.title,
    required this.subtitle,
    this.logoAsset,
    this.logoEmoji,
    required this.enabled,
    required this.onToggle,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: T.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: enabled
              ? T.accent.withValues(alpha:0.4)
              : T.muted.withValues(alpha:0.15),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha:0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: enabled
                        ? T.accent.withValues(alpha:0.12)
                        : T.muted.withValues(alpha:0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(logoEmoji ?? '💳', style: const TextStyle(fontSize: 22)),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: T.text,
                      )),
                      const SizedBox(height: 2),
                      Text(subtitle, style: TextStyle(
                        fontSize: 12,
                        color: T.muted,
                      )),
                    ],
                  ),
                ),
                Switch(
                  value: enabled,
                  onChanged: onToggle,
                  activeColor: T.accent,
                ),
              ],
            ),
          ),
          if (enabled) ...[
            Divider(height: 1, color: T.muted.withValues(alpha:0.1)),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: children),
            ),
          ],
        ],
      ),
    );
  }
}

class _CallbackNote extends StatelessWidget {
  final String label;
  final String value;

  const _CallbackNote({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.blue.withValues(alpha:0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.blue.withValues(alpha:0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600,
              color: Colors.blue.shade300,
            )),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(
              fontSize: 12, color: Colors.blue.shade200,
              fontFamily: 'monospace',
            )),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onDismiss;

  const _ErrorBanner(this.message, {required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.red.withValues(alpha:0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.withValues(alpha:0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(color: Colors.red, fontSize: 13))),
          IconButton(
            onPressed: onDismiss,
            icon: const Icon(Icons.close, color: Colors.red, size: 18),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }
}
