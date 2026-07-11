import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../halls/halls_page.dart';

class BranchesPage extends StatefulWidget {
  const BranchesPage({super.key});
  @override
  State<BranchesPage> createState() => _BranchesPageState();
}

class _BranchesPageState extends State<BranchesPage> {
  List<dynamic> _branches = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _branches = await Api().branches();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _addBranch() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => const _BranchForm(),
    );
    if (result == null) return;
    try {
      await Api().createBranch(result);
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  Future<void> _editBranch(Map<String, dynamic> branch) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      builder: (_) => _BranchForm(initial: branch),
    );
    if (result == null) return;
    try {
      await Api().updateBranch(branch['id'], result);
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Филиалы')),
      floatingActionButton: FloatingActionButton(
        onPressed: _addBranch,
        child: const Icon(Icons.add_location),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _branches.isEmpty
              ? const Center(child: Text('Нет филиалов', style: TextStyle(color: T.muted)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _branches.length,
                  itemBuilder: (_, i) {
                    final b = _branches[i];
                    final active = b['is_active'] == true;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: T.surface, borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: active ? T.border : T.danger.withValues(alpha: 0.3), width: 0.5),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        leading: Container(
                          width: 48, height: 48, alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: (active ? T.success : T.muted).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.store, color: active ? T.success : T.muted),
                        ),
                        title: Text(b['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          if (b['address'] != null) Text(b['address'], style: const TextStyle(color: T.muted, fontSize: 13)),
                          if (b['city'] != null) Text(b['city'], style: const TextStyle(color: T.muted, fontSize: 13)),
                          Text(active ? 'Активен' : 'Неактивен',
                            style: TextStyle(color: active ? T.success : T.danger, fontSize: 12, fontWeight: FontWeight.w600)),
                        ]),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(
                            icon: const Icon(Icons.table_restaurant, color: T.success, size: 20),
                            tooltip: 'Залы и столы',
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => HallsPage(branch: Map<String, dynamic>.from(b))),
                            ),
                          ),
                          const Icon(Icons.edit_outlined, color: T.muted),
                        ]),
                        onTap: () => _editBranch(Map<String, dynamic>.from(b)),
                      ),
                    );
                  },
                ),
          ),
    );
  }
}

class _BranchForm extends StatefulWidget {
  final Map<String, dynamic>? initial;
  const _BranchForm({this.initial});
  @override
  State<_BranchForm> createState() => _BranchFormState();
}

class _BranchFormState extends State<_BranchForm> {
  late final TextEditingController _name;
  late final TextEditingController _address;
  late final TextEditingController _city;
  late bool _active;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.initial?['name'] ?? '');
    _address = TextEditingController(text: widget.initial?['address'] ?? '');
    _city = TextEditingController(text: widget.initial?['city'] ?? '');
    _active = widget.initial?['is_active'] ?? true;
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(isEdit ? 'Редактировать филиал' : 'Новый филиал',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Название'), autofocus: !isEdit),
        const SizedBox(height: 12),
        TextField(controller: _address, decoration: const InputDecoration(labelText: 'Адрес')),
        const SizedBox(height: 12),
        TextField(controller: _city, decoration: const InputDecoration(labelText: 'Город')),
        if (isEdit) ...[
          const SizedBox(height: 12),
          SwitchListTile(
            title: const Text('Активен'), value: _active, activeColor: T.success,
            contentPadding: EdgeInsets.zero,
            onChanged: (v) => setState(() => _active = v),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () {
            if (_name.text.isEmpty) return;
            final data = <String, dynamic>{
              'name': _name.text,
              if (_address.text.isNotEmpty) 'address': _address.text,
              if (_city.text.isNotEmpty) 'city': _city.text,
            };
            if (isEdit) data['is_active'] = _active;
            Navigator.pop(context, data);
          },
          child: Text(isEdit ? 'Сохранить' : 'Создать'),
        )),
      ]),
    );
  }
}
