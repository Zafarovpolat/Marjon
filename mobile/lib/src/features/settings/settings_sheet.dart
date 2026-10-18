import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../i18n/strings.dart';
import '../../net/store.dart';
import '../../session/session.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../auth/server_dialog.dart';
import 'privacy_page.dart';

const appVersion = '1.1.0';

Future<void> showSettingsSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
      builder: (_) => const SettingsSheet(),
    );

class SettingsSheet extends StatefulWidget {
  const SettingsSheet({super.key});
  @override
  State<SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<SettingsSheet> {
  bool _sound = Store.soundEnabled;
  int _yellow = Store.timerYellow;
  int _red = Store.timerRed;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
      shrinkWrap: true,
      children: [
        Text(t('settings'), style: MT.h2),
        const SizedBox(height: 16),
        _Section(title: t('s_language'), children: [
          Row(children: [
            for (final l in const ['ru', 'uz'])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: SizedBox(width: double.infinity, child: Center(child: Text(l == 'ru' ? 'Русский' : 'Oʻzbekcha'))),
                    selected: currentLang() == l,
                    selectedColor: MC.teal500,
                    labelStyle: MT.label.copyWith(color: currentLang() == l ? Colors.white : MC.textSecondary),
                    onSelected: (_) {
                      s.setLang(l);
                      Navigator.pop(context);
                    },
                  ),
                ),
              ),
          ]),
        ]),
        _Section(title: t('s_sound'), children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('s_sound_notif'), style: MT.body),
            value: _sound,
            onChanged: (v) => setState(() {
              _sound = v;
              Store.soundEnabled = v;
            }),
          ),
        ]),
        _Section(title: t('s_kitchen_timers'), children: [
          Text(t('s_timers_hint'), style: MT.small.copyWith(fontSize: 13)),
          const SizedBox(height: 8),
          _StepperRow(label: t('s_yellow_after'), value: _yellow, min: 1, max: 60, onChanged: (v) {
            setState(() => _yellow = v);
            Store.timerYellow = v;
          }),
          _StepperRow(label: t('s_red_after'), value: _red, min: 1, max: 120, onChanged: (v) {
            setState(() => _red = v);
            Store.timerRed = v;
          }),
        ]),
        _Section(title: t('srv_setup'), children: [
          GhostButton(label: t('srv_setup'), icon: Icons.dns_outlined, onPressed: () => showServerDialog(context)),
          const SizedBox(height: 8),
          GhostButton(label: 'Политика конфиденциальности', icon: Icons.privacy_tip_outlined, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PrivacyPage()))),
        ]),
        const SizedBox(height: 4),
        Center(child: Text('Marjon Staff $appVersion', style: MT.small)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title.toUpperCase(), style: MT.small.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.6)),
          const SizedBox(height: 8),
          ...children,
        ]),
      );
}

class _StepperRow extends StatelessWidget {
  const _StepperRow({required this.label, required this.value, required this.min, required this.max, required this.onChanged});
  final String label;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(child: Text(label, style: MT.body)),
          IconButton.filledTonal(onPressed: value > min ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove)),
          SizedBox(width: 64, child: Center(child: Text('$value ${t('unit_min')}', style: MT.title.copyWith(fontSize: 16)))),
          IconButton.filledTonal(onPressed: value < max ? () => onChanged(value + 1) : null, icon: const Icon(Icons.add)),
        ]),
      );
}
