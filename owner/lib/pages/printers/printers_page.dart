import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class PrintersPage extends StatefulWidget {
  const PrintersPage({super.key});
  @override
  State<PrintersPage> createState() => _PrintersPageState();
}

class _PrintersPageState extends State<PrintersPage> {
  List<dynamic> _printers = [];
  List<dynamic> _branches = [];
  bool _loading = true;
  final Map<String, bool?> _pingStatus = {};

  static const _typeLabels = {'receipt': 'Чеки', 'kitchen': 'Кухня', 'bar': 'Бар', 'waiter': 'Официант', 'label': 'Этикетки'};
  static const _typeIcons = {
    'receipt': Icons.receipt_long, 'kitchen': Icons.soup_kitchen,
    'bar': Icons.local_bar, 'waiter': Icons.restaurant, 'label': Icons.label,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await Future.wait([Api().printers(), Api().branches()]);
      if (!mounted) return;
      setState(() { _printers = res[0]; _branches = res[1]; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _ping(Map<String, dynamic> printer) async {
    final ip = printer['ip_address'] as String?;
    if (ip == null) return;
    setState(() => _pingStatus[printer['id']] = null);
    try {
      final result = await Api().pingPrinter(ip, port: printer['port'] ?? 9100);
      if (mounted) setState(() => _pingStatus[printer['id']] = result['reachable'] == true);
    } catch (_) {
      if (mounted) setState(() => _pingStatus[printer['id']] = false);
    }
  }

  Future<void> _addPrinter() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _PrinterForm(branches: _branches),
    );
    if (result == null) return;
    try {
      await Api().createPrinter(result);
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  Future<void> _deletePrinter(Map<String, dynamic> printer) async {
    final confirm = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: T.surface,
      title: const Text('Удалить принтер?'),
      content: Text('${printer['name']} будет удалён'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: T.danger),
          onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
      ],
    ));
    if (confirm != true) return;
    try {
      await Api().deletePrinter(printer['id']);
      _load();
    } catch (_) {}
  }

  String _branchName(String? id) {
    if (id == null) return '';
    return (_branches.where((b) => b['id'] == id).firstOrNull)?['name'] ?? '';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Принтеры')),
      floatingActionButton: FloatingActionButton(onPressed: _addPrinter, child: const Icon(Icons.add)),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _printers.isEmpty
              ? const Center(child: Text('Нет принтеров', style: TextStyle(color: T.muted)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _printers.length,
                  itemBuilder: (_, i) {
                    final p = Map<String, dynamic>.from(_printers[i]);
                    final ping = _pingStatus[p['id']];
                    final type = p['printer_type'] as String? ?? 'receipt';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(color: T.surface, borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: T.border, width: 0.5)),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        leading: Container(
                          width: 44, height: 44, alignment: Alignment.center,
                          decoration: BoxDecoration(color: T.accent.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                          child: Icon(_typeIcons[type] ?? Icons.print, color: T.accent),
                        ),
                        title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${_typeLabels[type] ?? type} · ${p['ip_address']}:${p['port']}',
                            style: const TextStyle(color: T.muted, fontSize: 13)),
                          Text(_branchName(p['branch_id']), style: const TextStyle(color: T.muted, fontSize: 12)),
                          if (ping != null)
                            Row(children: [
                              Icon(ping ? Icons.check_circle : Icons.cancel, size: 14,
                                color: ping ? T.success : T.danger),
                              const SizedBox(width: 4),
                              Text(ping ? 'Онлайн' : 'Недоступен',
                                style: TextStyle(color: ping ? T.success : T.danger, fontSize: 12)),
                            ]),
                        ]),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(icon: const Icon(Icons.wifi_find, size: 20), onPressed: () => _ping(p),
                            tooltip: 'Проверить'),
                          IconButton(icon: const Icon(Icons.delete_outline, size: 20, color: T.danger),
                            onPressed: () => _deletePrinter(p)),
                        ]),
                      ),
                    );
                  },
                ),
          ),
    );
  }
}

class _PrinterForm extends StatefulWidget {
  final List<dynamic> branches;
  const _PrinterForm({required this.branches});
  @override
  State<_PrinterForm> createState() => _PrinterFormState();
}

class _PrinterFormState extends State<_PrinterForm> {
  final _name = TextEditingController();
  final _ip = TextEditingController();
  final _port = TextEditingController(text: '9100');
  String _type = 'receipt';
  String? _branchId;

  static const _types = [
    ('receipt', 'Чеки'), ('kitchen', 'Кухня'), ('bar', 'Бар'), ('waiter', 'Официант'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.branches.isNotEmpty) _branchId = widget.branches[0]['id'];
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Новый принтер', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Название'), autofocus: true),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(flex: 3, child: TextField(controller: _ip, decoration: const InputDecoration(labelText: 'IP адрес', hintText: '192.168.1.100'))),
          const SizedBox(width: 8),
          Expanded(child: TextField(controller: _port, decoration: const InputDecoration(labelText: 'Порт'), keyboardType: TextInputType.number)),
        ]),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _type, decoration: const InputDecoration(labelText: 'Тип'), dropdownColor: T.surface,
          items: _types.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2))).toList(),
          onChanged: (v) => setState(() => _type = v!),
        ),
        const SizedBox(height: 12),
        if (widget.branches.isNotEmpty) DropdownButtonFormField<String>(
          value: _branchId, decoration: const InputDecoration(labelText: 'Филиал'), dropdownColor: T.surface,
          items: widget.branches.map<DropdownMenuItem<String>>((b) =>
            DropdownMenuItem(value: b['id'] as String, child: Text(b['name']))).toList(),
          onChanged: (v) => setState(() => _branchId = v),
        ),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () {
            if (_name.text.isEmpty || _ip.text.isEmpty || _branchId == null) return;
            Navigator.pop(context, {
              'name': _name.text, 'ip_address': _ip.text,
              'port': int.tryParse(_port.text) ?? 9100,
              'printer_type': _type, 'branch_id': _branchId,
              'connection_type': 'network',
            });
          },
          child: const Text('Создать'),
        )),
      ]),
    );
  }
}
