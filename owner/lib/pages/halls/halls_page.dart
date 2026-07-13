import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class HallsPage extends StatefulWidget {
  final Map<String, dynamic> branch;
  const HallsPage({super.key, required this.branch});
  @override
  State<HallsPage> createState() => _HallsPageState();
}

class _HallsPageState extends State<HallsPage> {
  List<dynamic> _halls = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final halls = await Api().halls(branchId: widget.branch['id']);
      if (!mounted) return;
      setState(() { _halls = halls; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addHall() async {
    final result = await showModalBottomSheet<String>(
      context: context, isScrollControlled: true,
      backgroundColor: T.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _HallNameForm(title: 'Новый зал'),
    );
    if (result == null || result.isEmpty) return;
    try {
      await Api().createHall({'branch_id': widget.branch['id'], 'name': result});
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e'), backgroundColor: T.danger));
      }
    }
  }

  Future<void> _deleteHall(Map<String, dynamic> hall) async {
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: T.surface,
      title: const Text('Удалить зал?'),
      content: Text('Зал "${hall['name']}" и все его столы будут удалены'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: T.danger),
          onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
      ],
    ));
    if (ok != true) return;
    await Api().deleteHall(hall['id']);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Залы — ${widget.branch['name']}'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      floatingActionButton: FloatingActionButton(onPressed: _addHall, child: const Icon(Icons.add)),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _halls.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.table_restaurant, size: 56, color: T.muted),
                  const SizedBox(height: 12),
                  const Text('Нет залов', style: TextStyle(color: T.muted, fontSize: 16)),
                  const SizedBox(height: 8),
                  TextButton.icon(onPressed: _addHall, icon: const Icon(Icons.add), label: const Text('Добавить зал')),
                ]))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                  itemCount: _halls.length,
                  itemBuilder: (_, i) {
                    final hall = _halls[i];
                    final tables = (hall['tables'] as List?) ?? [];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: T.surface, borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: T.border, width: 0.5),
                      ),
                      child: ExpansionTile(
                        tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                        shape: const Border(),
                        leading: Container(
                          width: 44, height: 44, alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: T.success.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.meeting_room, color: T.success, size: 22),
                        ),
                        title: Text(hall['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${tables.length} столов',
                          style: const TextStyle(color: T.muted, fontSize: 13)),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(
                            icon: const Icon(Icons.delete_outline, color: T.danger, size: 20),
                            onPressed: () => _deleteHall(hall),
                          ),
                          const Icon(Icons.expand_more, color: T.muted),
                        ]),
                        children: [
                          _TablesSection(hall: hall, onChanged: _load),
                        ],
                      ),
                    );
                  },
                ),
          ),
    );
  }
}

class _TablesSection extends StatelessWidget {
  final Map<String, dynamic> hall;
  final VoidCallback onChanged;
  const _TablesSection({required this.hall, required this.onChanged});

  Future<void> _addTable(BuildContext context) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true,
      backgroundColor: T.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TableForm(),
    );
    if (result == null) return;
    try {
      await Api().createTable(hall['id'], result);
      onChanged();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e'), backgroundColor: T.danger));
      }
    }
  }

  Future<void> _deleteTable(BuildContext context, Map<String, dynamic> table) async {
    await Api().deleteTable(hall['id'], table['id']);
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final tables = (hall['tables'] as List?) ?? [];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (tables.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Нет столов', style: TextStyle(color: T.muted)),
          )
        else
          Wrap(spacing: 8, runSpacing: 8, children: tables.map<Widget>((t) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: T.bg, borderRadius: BorderRadius.circular(10),
                border: Border.all(color: T.border),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.table_restaurant, size: 16, color: T.accent),
                const SizedBox(width: 6),
                Text('Стол ${t['number']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(width: 4),
                Text('(${t['capacity']} мест)', style: const TextStyle(color: T.muted, fontSize: 12)),
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () => _deleteTable(context, t),
                  child: const Icon(Icons.close, size: 14, color: T.muted),
                ),
              ]),
            );
          }).toList()),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: () => _addTable(context),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Добавить стол'),
        ),
      ]),
    );
  }
}

class _HallNameForm extends StatefulWidget {
  final String title;
  const _HallNameForm({required this.title});
  @override
  State<_HallNameForm> createState() => _HallNameFormState();
}

class _HallNameFormState extends State<_HallNameForm> {
  final _ctrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(widget.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _ctrl, autofocus: true, decoration: const InputDecoration(labelText: 'Название зала')),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () => Navigator.pop(context, _ctrl.text.trim()),
          child: const Text('Создать'),
        )),
      ]),
    );
  }
}

class _TableForm extends StatefulWidget {
  @override
  State<_TableForm> createState() => _TableFormState();
}

class _TableFormState extends State<_TableForm> {
  final _number = TextEditingController();
  final _capacity = TextEditingController(text: '4');

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Новый стол', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: TextField(controller: _number, autofocus: true,
            decoration: const InputDecoration(labelText: 'Номер стола'),
            keyboardType: TextInputType.number)),
          const SizedBox(width: 12),
          Expanded(child: TextField(controller: _capacity,
            decoration: const InputDecoration(labelText: 'Мест'),
            keyboardType: TextInputType.number)),
        ]),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: () {
            final num = int.tryParse(_number.text);
            if (num == null) return;
            Navigator.pop(context, {
              'number': num,
              'capacity': int.tryParse(_capacity.text) ?? 4,
            });
          },
          child: const Text('Добавить'),
        )),
      ]),
    );
  }
}
