import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';

enum FieldType { text, multiline, number, select, toggle }

class Field {
  const Field(this.key, this.label, {this.type = FieldType.text, this.options, this.loadOptions, this.required = false, this.hint, this.defaultValue, this.onlyCreate = false});
  final String key;
  final String label;
  final FieldType type;
  final Map<String, String>? options;
  final Future<Map<String, String>> Function()? loadOptions;
  final bool required;
  final String? hint;
  final dynamic defaultValue;
  final bool onlyCreate;
}

class ResourceConfig {
  const ResourceConfig({
    required this.title,
    required this.path,
    required this.itemTitle,
    this.itemSubtitle,
    this.itemTrailing,
    required this.fields,
    this.query,
    this.canCreate = true,
    this.canEdit = true,
    this.canDelete = true,
    this.emptyText = 'Пока пусто',
    this.createLabel = 'Добавить',
    this.createExtra,
    this.icon = Icons.list_alt_outlined,
    this.beforeSave,
  });
  final String title;
  final String path;
  final Map<String, dynamic>? query;
  final String Function(Json) itemTitle;
  final String? Function(Json)? itemSubtitle;
  final Widget? Function(Json)? itemTrailing;
  final List<Field> fields;
  final bool canCreate;
  final bool canEdit;
  final bool canDelete;
  final String emptyText;
  final String createLabel;
  final Map<String, dynamic>? createExtra;
  final IconData icon;
  final void Function(Map<String, dynamic> body, bool isNew)? beforeSave;
}

/// Generic list + create/edit/delete screen driven by [ResourceConfig].
class ResourcePage extends StatefulWidget {
  const ResourcePage(this.config, {super.key, this.embedded = false});
  final ResourceConfig config;
  final bool embedded;
  @override
  State<ResourcePage> createState() => _ResourcePageState();
}

class _ResourcePageState extends State<ResourcePage> {
  List<Json> rows = [];
  bool loading = true;
  String? error;
  String q = '';

  ResourceConfig get c => widget.config;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      rows = asJsonList(await Api.i.get(c.path, query: c.query));
      error = null;
    } on ApiError catch (e) {
      error = e.message;
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _open(Json? item) async {
    final ok = await push<bool>(context, ResourceForm(config: c, item: item));
    if (ok == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = q.trim().toLowerCase();
    final shown = rows.where((r) => s.isEmpty || c.itemTitle(r).toLowerCase().contains(s)).toList();
    final body = loading && rows.isEmpty
        ? const Center(child: CircularProgressIndicator())
        : error != null && rows.isEmpty
            ? ErrorState('Не удалось загрузить: $error', onRetry: _load)
            : RefreshIndicator(
                onRefresh: _load,
                child: shown.isEmpty
                    ? ListView(children: [SizedBox(height: 300, child: EmptyState(c.emptyText, icon: c.icon))])
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final r = shown[i];
                          final sub = c.itemSubtitle?.call(r);
                          return Card2(
                            onTap: c.canEdit ? () => _open(r) : null,
                            child: Row(children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(c.itemTitle(r), style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                  if (sub != null && sub.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub, style: MT.small)),
                                ]),
                              ),
                              if (c.itemTrailing?.call(r) != null) c.itemTrailing!(r)!,
                              if (c.canEdit) const Icon(Icons.chevron_right, color: MC.n300),
                            ]),
                          );
                        },
                      ),
              );
    final content = Column(children: [
      if (rows.length > 8)
        Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: TextField(onChanged: (v) => setState(() => q = v), decoration: const InputDecoration(hintText: 'Поиск', prefixIcon: Icon(Icons.search), isDense: true))),
      Expanded(child: body),
    ]);
    if (widget.embedded) return content;
    return Scaffold(
      appBar: AppBar(title: Text(c.title)),
      floatingActionButton: c.canCreate ? FloatingActionButton.extended(onPressed: () => _open(null), icon: const Icon(Icons.add), label: Text(c.createLabel)) : null,
      body: content,
    );
  }
}

class ResourceForm extends StatefulWidget {
  const ResourceForm({super.key, required this.config, this.item});
  final ResourceConfig config;
  final Json? item;
  @override
  State<ResourceForm> createState() => _ResourceFormState();
}

class _ResourceFormState extends State<ResourceForm> {
  final ctrls = <String, TextEditingController>{};
  final values = <String, dynamic>{};
  final options = <String, Map<String, String>>{};
  bool busy = false;

  bool get isNew => widget.item == null;

  @override
  void initState() {
    super.initState();
    for (final f in widget.config.fields) {
      final v = widget.item?[f.key] ?? f.defaultValue;
      if (f.type == FieldType.select || f.type == FieldType.toggle) {
        values[f.key] = v;
      } else {
        ctrls[f.key] = TextEditingController(text: v == null ? '' : '$v');
      }
      if (f.options != null) options[f.key] = f.options!;
      if (f.loadOptions != null) {
        f.loadOptions!().then((o) {
          if (mounted) setState(() => options[f.key] = o);
        }).catchError((_) {});
      }
    }
  }

  @override
  void dispose() {
    for (final c in ctrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (busy) return;
    final body = <String, dynamic>{...?widget.config.createExtra};
    for (final f in widget.config.fields) {
      if (f.onlyCreate && !isNew) continue;
      dynamic v;
      switch (f.type) {
        case FieldType.select:
        case FieldType.toggle:
          v = values[f.key];
        case FieldType.number:
          final raw = ctrls[f.key]!.text.trim().replaceAll(',', '.');
          v = raw.isEmpty ? null : num.tryParse(raw);
        default:
          final raw = ctrls[f.key]!.text.trim();
          v = raw.isEmpty ? null : raw;
      }
      if (f.required && (v == null || v == '')) {
        toast(context, 'Заполните: ${f.label}', error: true);
        return;
      }
      if (v != null || !isNew) body[f.key] = v;
    }
    widget.config.beforeSave?.call(body, isNew);
    setState(() => busy = true);
    try {
      final c = widget.config;
      if (isNew) {
        await Api.i.post(c.path, data: body);
      } else {
        await Api.i.patch('${c.path}/${widget.item!['id']}', data: body);
      }
      if (mounted) {
        toast(context, 'Сохранено');
        Navigator.of(context).pop(true);
      }
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'Удалить «${widget.config.itemTitle(widget.item!)}»?')) return;
    try {
      await Api.i.delete('${widget.config.path}/${widget.item!['id']}');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.config;
    return Scaffold(
      appBar: AppBar(
        title: Text(isNew ? c.createLabel : 'Редактирование'),
        actions: [if (!isNew && c.canDelete) IconBtn(icon: Icons.delete_outline, color: MC.red500, onTap: _delete, tooltip: 'Удалить')],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        for (final f in c.fields)
          if (!(f.onlyCreate && !isNew))
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: switch (f.type) {
                FieldType.toggle => SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(f.label), value: values[f.key] == true, onChanged: (v) => setState(() => values[f.key] = v)),
                FieldType.select => Labeled(
                    f.label,
                    DropdownButtonFormField<String>(
                      initialValue: (options[f.key]?.containsKey('${values[f.key]}') ?? false) ? '${values[f.key]}' : null,
                      isExpanded: true,
                      hint: Text(f.hint ?? 'Выберите'),
                      items: [for (final e in (options[f.key] ?? const <String, String>{}).entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))],
                      onChanged: (v) => setState(() => values[f.key] = v),
                    ),
                  ),
                _ => Labeled(
                    f.required ? '${f.label} *' : f.label,
                    TextField(
                      controller: ctrls[f.key],
                      keyboardType: f.type == FieldType.number ? const TextInputType.numberWithOptions(decimal: true) : (f.type == FieldType.multiline ? TextInputType.multiline : TextInputType.text),
                      maxLines: f.type == FieldType.multiline ? 4 : 1,
                      decoration: InputDecoration(hintText: f.hint),
                    ),
                  ),
              },
            ),
        const SizedBox(height: 8),
        BusyButton(label: 'Сохранить', busy: busy, onPressed: _save),
      ]),
    );
  }
}
