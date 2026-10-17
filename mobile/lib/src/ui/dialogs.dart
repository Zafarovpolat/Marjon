import 'package:flutter/material.dart';

import '../i18n/strings.dart';
import '../net/api.dart';
import '../theme/tokens.dart';
import 'kit.dart';

class PromptOption {
  const PromptOption(this.value, this.label);
  final String value;
  final String label;
}

/// Port of InputPromptModal: a title, a hint, and either a text/password field or
/// a list of options, plus an optional comment. [onSubmit] throws to show an error inline.
Future<void> showPrompt(
  BuildContext context, {
  required String title,
  String? hint,
  String placeholder = '',
  String initial = '',
  bool password = false,
  bool number = false,
  List<PromptOption> options = const [],
  ({String label, String placeholder})? extra,
  String? submitLabel,
  required Future<void> Function(String value, String extra) onSubmit,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _PromptSheet(
        title: title,
        hint: hint,
        placeholder: placeholder,
        initial: initial,
        password: password,
        number: number,
        options: options,
        extra: extra,
        submitLabel: submitLabel,
        onSubmit: onSubmit,
      ),
    );

class _PromptSheet extends StatefulWidget {
  const _PromptSheet({
    required this.title,
    required this.hint,
    required this.placeholder,
    required this.initial,
    required this.password,
    required this.number,
    required this.options,
    required this.extra,
    required this.submitLabel,
    required this.onSubmit,
  });
  final String title;
  final String? hint;
  final String placeholder;
  final String initial;
  final bool password;
  final bool number;
  final List<PromptOption> options;
  final ({String label, String placeholder})? extra;
  final String? submitLabel;
  final Future<void> Function(String value, String extra) onSubmit;

  @override
  State<_PromptSheet> createState() => _PromptSheetState();
}

class _PromptSheetState extends State<_PromptSheet> {
  late final TextEditingController _value = TextEditingController(text: widget.initial);
  final _extra = TextEditingController();
  late String _picked = widget.options.isEmpty
      ? ''
      : (widget.options.any((o) => o.value == widget.initial) ? widget.initial : widget.options.first.value);
  bool _busy = false;
  String _err = '';

  @override
  void dispose() {
    _value.dispose();
    _extra.dispose();
    super.dispose();
  }

  String get _current => widget.options.isNotEmpty ? _picked : _value.text.trim();

  Future<void> _submit() async {
    if (_busy || _current.isEmpty) return;
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.onSubmit(_current, _extra.text.trim());
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _err = e is ApiError ? e.message : e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.title, style: MT.h2),
            const SizedBox(height: 14),
            if (widget.hint != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(widget.hint!, style: MT.label)),
            if (widget.options.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _picked,
                isExpanded: true,
                items: [for (final o in widget.options) DropdownMenuItem(value: o.value, child: Text(o.label))],
                onChanged: _busy ? null : (v) => setState(() => _picked = v ?? _picked),
              )
            else
              TextField(
                controller: _value,
                autofocus: true,
                enabled: !_busy,
                obscureText: widget.password,
                keyboardType: widget.number ? TextInputType.number : TextInputType.text,
                decoration: InputDecoration(hintText: widget.placeholder),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _submit(),
              ),
            if (widget.extra != null) ...[
              const SizedBox(height: 14),
              Text(widget.extra!.label, style: MT.label),
              const SizedBox(height: 6),
              TextField(controller: _extra, enabled: !_busy, minLines: 2, maxLines: 3, decoration: InputDecoration(hintText: widget.extra!.placeholder)),
            ],
            if (_err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err, style: MT.body.copyWith(color: MC.red600, fontSize: 14))),
            const SizedBox(height: 18),
            Row(children: [
              Expanded(child: GhostButton(label: t('cancel'), onPressed: _busy ? null : () => Navigator.pop(context))),
              const SizedBox(width: 12),
              Expanded(child: BusyButton(label: widget.submitLabel ?? t('save'), busy: _busy, onPressed: _current.isEmpty ? null : _submit)),
            ]),
          ]),
        ),
      );
}

/// Simple confirm dialog. Returns true when confirmed.
Future<bool> confirmDialog(BuildContext context, {required String title, String? body, String? confirmLabel, bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('cancel'))),
        TextButton(
          onPressed: () => Navigator.pop(c, true),
          child: Text(confirmLabel ?? t('save'), style: TextStyle(color: danger ? MC.red600 : MC.teal600)),
        ),
      ],
    ),
  );
  return r == true;
}

/// Bottom-sheet employee picker (port of WaiterPicker). Returns the chosen id, or null when dismissed.
Future<String?> pickStaff(BuildContext context, {required List<Map<String, dynamic>> staff, String? current, String? title}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (_, controller) => Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Align(alignment: Alignment.centerLeft, child: Text(title ?? t('change_waiter'), style: MT.h2))),
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: staff.length,
              itemBuilder: (_, i) {
                final s = staff[i];
                final name = (s['name'] ?? s['email'] ?? '') as String;
                final on = '${s['id']}' == '${current ?? ''}';
                return ListTile(
                  leading: Avatar(name, size: 40),
                  title: Text(name, style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                  trailing: on ? const Icon(Icons.check, color: MC.teal500) : null,
                  onTap: () => Navigator.pop(c, '${s['id']}'),
                );
              },
            ),
          ),
        ]),
      ),
    );

String staffName(List<Map<String, dynamic>> staff, dynamic id, {String fallback = '—'}) {
  for (final s in staff) {
    if ('${s['id']}' == '${id ?? ''}') return (s['name'] ?? s['email'] ?? fallback) as String;
  }
  return fallback;
}
