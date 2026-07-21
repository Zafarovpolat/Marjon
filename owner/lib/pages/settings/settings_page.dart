import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  bool _loading = true;

  Map<String, dynamic> _company = {};
  List<Map<String, dynamic>> _payTypes = [];
  List<Map<String, dynamic>> _units    = [];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _load();
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        Api().company(),
        Api().paymentTypes(),
        Api().units(),
      ]);
      _company  = results[0] as Map<String, dynamic>;
      _payTypes = List<Map<String, dynamic>>.from(results[1] as List);
      _units    = List<Map<String, dynamic>>.from(results[2] as List);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: T.bg,
    appBar: AppBar(
      title: const Text('Настройки'),
      bottom: TabBar(controller: _tabs, tabs: const [
        Tab(text: 'Компания'),
        Tab(text: 'Оплата'),
        Tab(text: 'Единицы'),
        Tab(text: 'Сервер'),
      ]),
    ),
    body: _loading
      ? const LoadingCenter()
      : TabBarView(controller: _tabs, children: [
          _CompanyTab(company: _company, onSaved: _load),
          _PayTypesTab(items: _payTypes, onSaved: _load),
          _UnitsTab(items: _units, onSaved: _load),
          const _ServerTab(),
        ]),
  );
}

// ── Company tab ───────────────────────────────────────────────────────────────

class _CompanyTab extends StatefulWidget {
  final Map<String, dynamic> company;
  final VoidCallback onSaved;
  const _CompanyTab({required this.company, required this.onSaved});

  @override
  State<_CompanyTab> createState() => _CompanyTabState();
}

class _CompanyTabState extends State<_CompanyTab> {
  late TextEditingController _name, _currency, _phone, _address, _timezone;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final c = widget.company;
    _name     = TextEditingController(text: c['name']?.toString() ?? '');
    _currency = TextEditingController(text: c['currency']?.toString() ?? 'UZS');
    _phone    = TextEditingController(text: c['phone']?.toString() ?? '');
    _address  = TextEditingController(text: c['address']?.toString() ?? '');
    _timezone = TextEditingController(text: c['timezone']?.toString() ?? 'Asia/Tashkent');
  }

  @override
  void dispose() {
    for (final c in [_name, _currency, _phone, _address, _timezone]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await Api().updateCompany({
        'name': _name.text.trim(),
        'currency': _currency.text.trim(),
        'phone': _phone.text.trim(),
        'address': _address.text.trim(),
        'timezone': _timezone.text.trim(),
      });
      widget.onSaved();
      if (mounted) showSnack(context, 'Сохранено');
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      _sectionLabel('Организация'),
      mField('Название', _name),
      mField('Валюта', _currency, hint: 'UZS'),
      mField('Телефон', _phone, keyboard: TextInputType.phone),
      mField('Адрес', _address, maxLines: 2),
      _sectionLabel('Система'),
      mField('Часовой пояс', _timezone, hint: 'Asia/Tashkent'),
      const SizedBox(height: 8),
      SizedBox(width: double.infinity, child: ElevatedButton(
        onPressed: _saving ? null : _save,
        style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        child: _saving
          ? const SizedBox(height: 20, width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : const Text('Сохранить', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
      )),
    ],
  );

  Widget _sectionLabel(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 10, top: 4),
    child: Text(t.toUpperCase(), style: const TextStyle(
      fontSize: 11, fontWeight: FontWeight.w700, color: T.muted, letterSpacing: 1.1)),
  );
}

// ── Payment types tab ─────────────────────────────────────────────────────────

class _PayTypesTab extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final VoidCallback onSaved;
  const _PayTypesTab({required this.items, required this.onSaved});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      floatingActionButton: FloatingActionButton(
        backgroundColor: T.accent,
        onPressed: () => _showSheet(context),
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: items.isEmpty
        ? const EmptyState(
            icon: Icons.credit_card_outlined,
            message: 'Нет способов оплаты',
            sub: 'Добавьте первый способ')
        : ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            itemCount: items.length,
            itemBuilder: (_, i) => _PayRow(item: items[i], onChanged: onSaved),
          ),
    );
  }

  void _showSheet(BuildContext ctx) => showModalBottomSheet(
    context: ctx, isScrollControlled: true,
    builder: (_) => _PaySheet(onSaved: onSaved),
  );
}

class _PayRow extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onChanged;
  const _PayRow({required this.item, required this.onChanged});

  static const _icons = <String, IconData>{
    'cash': Icons.payments_outlined,
    'card': Icons.credit_card,
    'transfer': Icons.swap_horiz,
    'online': Icons.language,
  };

  @override
  Widget build(BuildContext context) {
    final type = item['type']?.toString() ?? 'cash';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: T.surface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border, width: 0.5),
      ),
      child: ListTile(
        leading: Container(
          width: 40, height: 40, alignment: Alignment.center,
          decoration: BoxDecoration(
            color: T.accent.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
          child: Icon(_icons[type] ?? Icons.payment, color: T.accent, size: 20),
        ),
        title: Text(item['name']?.toString() ?? '—',
          style: const TextStyle(fontWeight: FontWeight.w600, color: T.text)),
        subtitle: Text(type, style: const TextStyle(color: T.muted, fontSize: 12)),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 18, color: T.muted),
            onPressed: () => showModalBottomSheet(
              context: context, isScrollControlled: true,
              builder: (_) => _PaySheet(existing: item, onSaved: onChanged),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 18, color: T.danger),
            onPressed: () async {
              final ok = await confirmDialog(context,
                title: 'Удалить?', message: 'Удалить "${item['name']}"?');
              if (ok && context.mounted) {
                await Api().deletePaymentType(item['id'].toString());
                onChanged();
              }
            },
          ),
        ]),
      ),
    );
  }
}

class _PaySheet extends StatefulWidget {
  final Map<String, dynamic>? existing;
  final VoidCallback onSaved;
  const _PaySheet({this.existing, required this.onSaved});

  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  final _name = TextEditingController();
  String _type = 'cash';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.existing != null) {
      _name.text = widget.existing!['name']?.toString() ?? '';
      _type = widget.existing!['type']?.toString() ?? 'cash';
    }
  }

  @override
  void dispose() { _name.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final data = {'name': _name.text.trim(), 'type': _type};
      if (widget.existing != null) {
        await Api().updatePaymentType(widget.existing!['id'].toString(), data);
      } else {
        await Api().createPaymentType(data);
      }
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: widget.existing == null ? 'Добавить способ оплаты' : 'Редактировать',
    onSubmit: _save, loading: _saving,
    fields: [
      mField('Название', _name, hint: 'Наличные'),
      mDropdown<String>('Тип', _type, const [
        DropdownMenuItem(value: 'cash',     child: Text('Наличные')),
        DropdownMenuItem(value: 'card',     child: Text('Карта')),
        DropdownMenuItem(value: 'transfer', child: Text('Перевод')),
        DropdownMenuItem(value: 'online',   child: Text('Онлайн')),
      ], (v) => setState(() => _type = v ?? 'cash')),
    ],
  );
}

// ── Units tab ─────────────────────────────────────────────────────────────────

class _UnitsTab extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final VoidCallback onSaved;
  const _UnitsTab({required this.items, required this.onSaved});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: T.bg,
    floatingActionButton: FloatingActionButton(
      backgroundColor: T.accent,
      onPressed: () => _showSheet(context),
      child: const Icon(Icons.add, color: Colors.white),
    ),
    body: items.isEmpty
      ? const EmptyState(
          icon: Icons.straighten_outlined,
          message: 'Нет единиц измерения',
          sub: 'Добавьте шт, кг, л...')
      : ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          itemCount: items.length,
          itemBuilder: (_, i) {
            final u = items[i];
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: T.surface, borderRadius: BorderRadius.circular(14),
                border: Border.all(color: T.border, width: 0.5),
              ),
              child: ListTile(
                leading: Container(
                  width: 40, height: 40, alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: T.purple.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.straighten_outlined, color: T.purple, size: 20),
                ),
                title: Text(u['name']?.toString() ?? '—',
                  style: const TextStyle(fontWeight: FontWeight.w600, color: T.text)),
                subtitle: u['short_name'] != null
                  ? Text(u['short_name'].toString(), style: const TextStyle(color: T.muted, fontSize: 12))
                  : null,
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18, color: T.danger),
                  onPressed: () async {
                    final ok = await confirmDialog(context,
                      title: 'Удалить?', message: 'Удалить "${u['name']}"?');
                    if (ok && context.mounted) {
                      await Api().deleteUnit(u['id'].toString());
                      onSaved();
                    }
                  },
                ),
              ),
            );
          },
        ),
  );

  void _showSheet(BuildContext ctx) => showModalBottomSheet(
    context: ctx, isScrollControlled: true,
    builder: (_) => _UnitSheet(onSaved: onSaved),
  );
}

class _UnitSheet extends StatefulWidget {
  final VoidCallback onSaved;
  const _UnitSheet({required this.onSaved});

  @override
  State<_UnitSheet> createState() => _UnitSheetState();
}

class _UnitSheetState extends State<_UnitSheet> {
  final _name  = TextEditingController();
  final _short = TextEditingController();
  bool _saving = false;

  @override
  void dispose() { _name.dispose(); _short.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await Api().createUnit({
        'name': _name.text.trim(),
        'short_name': _short.text.trim(),
      });
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showSnack(context, 'Ошибка: $e', error: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) => FormSheet(
    title: 'Добавить единицу',
    onSubmit: _save, loading: _saving,
    fields: [
      mField('Название', _name, hint: 'Килограмм'),
      mField('Сокращение', _short, hint: 'кг'),
    ],
  );
}

// ── Server tab ────────────────────────────────────────────────────────────────

class _ServerTab extends StatefulWidget {
  const _ServerTab();
  @override
  State<_ServerTab> createState() => _ServerTabState();
}

class _ServerTabState extends State<_ServerTab> {
  final _urlCtrl = TextEditingController();
  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() { _urlCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('server_url') ?? 'http://localhost:8000/api/v1';
    if (mounted) setState(() { _urlCtrl.text = url; _loaded = true; });
  }

  Future<void> _save() async {
    final url = _urlCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _saving = true);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_url', url);
    if (mounted) {
      showSnack(context, 'Сохранено. Перезайдите в приложение.');
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const LoadingCenter();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: T.accent.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: T.accent.withValues(alpha: 0.2)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.info_outline, size: 18, color: T.accent),
            const SizedBox(width: 10),
            const Expanded(child: Text(
              'URL должен включать /api/v1\n'
              'Пример: http://192.168.1.10:8000/api/v1\n'
              'Для продакшена: https://api.yourserver.com/api/v1',
              style: TextStyle(fontSize: 13, color: T.text, height: 1.5),
            )),
          ]),
        ),
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.only(bottom: 10, top: 4),
          child: Text('АДРЕС СЕРВЕРА', style: const TextStyle(
            fontSize: 11, fontWeight: FontWeight.w700,
            color: T.muted, letterSpacing: 1.1)),
        ),
        TextFormField(
          controller: _urlCtrl,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(
            hintText: 'http://localhost:8000/api/v1',
            prefixIcon: Icon(Icons.link, size: 18),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: _saving ? null : _save,
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          child: _saving
            ? const SizedBox(height: 20, width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Text('Сохранить', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        )),
      ],
    );
  }
}
