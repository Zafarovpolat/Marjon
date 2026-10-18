import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../i18n/strings.dart';
import '../../net/store.dart';
import '../../services/kitchen_ws.dart';
import '../../session/session.dart';
import '../../theme/tokens.dart';
import '../../ui/kit.dart';
import '../settings/settings_sheet.dart';
import 'mode_host.dart';
import 'modes.dart';

/// App shell after a staff sign-in: top bar, mode content, status bar.
class Workspace extends StatefulWidget {
  const Workspace({super.key});
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  final _host = ModeHostController();
  int _reload = 0;
  void Function()? _unsubWs;

  @override
  void initState() {
    super.initState();
    final s = context.read<Session>();
    final token = Store.staffToken;
    if (token != null && s.hasBranch) {
      KitchenWs.i.connect(token, s.branchId);
      _unsubWs = KitchenWs.i.on('connection', (d) {
        if (d is Map) s.setOnline(d['status'] == 'online');
      });
    }
  }

  @override
  void dispose() {
    _unsubWs?.call();
    KitchenWs.i.disconnect();
    _host.dispose();
    super.dispose();
  }

  Future<void> _confirmLogout(Session s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('logout')),
        content: Text(t('logout_confirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('cancel'))),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text(t('logout'), style: const TextStyle(color: MC.red600))),
        ],
      ),
    );
    if (ok == true) s.logoutStaff();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final mode = modeLabels.containsKey(s.mode) ? s.mode! : 'cashier';
    return ModeHost(
      controller: _host,
      child: Scaffold(
        backgroundColor: MC.bg,
        appBar: _TopBar(
          host: _host,
          onRefresh: () => setState(() => _reload++),
          onSettings: () => showSettingsSheet(context),
          onAccount: () => _confirmLogout(s),
        ),
        body: KeyedSubtree(key: ValueKey('$mode-$_reload'), child: buildMode(mode, s)),
        bottomNavigationBar: _StatusBar(session: s, mode: mode),
      ),
    );
  }
}

class _TopBar extends StatelessWidget implements PreferredSizeWidget {
  const _TopBar({required this.host, required this.onRefresh, required this.onSettings, required this.onAccount});
  final ModeHostController host;
  final VoidCallback onRefresh;
  final VoidCallback onSettings;
  final VoidCallback onAccount;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) => Material(
        color: MC.card,
        elevation: 0,
        child: Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: MC.border))),
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 60,
              child: Row(children: [
                const SizedBox(width: 12),
                Container(
                  width: 38,
                  height: 38,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(11), border: Border.all(color: MC.borderLight)),
                  child: Image.asset('assets/images/logo_mark.png'),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('MARJON', maxLines: 1, style: TextStyle(fontFamily: MC.fontDisplay, fontWeight: FontWeight.w800, fontSize: 16, color: MC.textPrimary, height: 1.05)),
                    Text('RESTAURANT OS', maxLines: 1, overflow: TextOverflow.ellipsis, style: MT.small.copyWith(fontSize: 9, letterSpacing: 1.1, fontWeight: FontWeight.w600)),
                  ]),
                ),
                const Spacer(),
                ListenableBuilder(
                  listenable: host,
                  builder: (_, __) => host.items.isEmpty
                      ? const SizedBox.shrink()
                      : PopupMenuButton<ModeMenuItem>(
                          tooltip: t('menu_more'),
                          icon: const Icon(Icons.more_vert, color: MC.textPrimary),
                          offset: const Offset(0, 48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MC.rMd)),
                          onSelected: (m) => m.onTap(),
                          itemBuilder: (_) => [
                            for (final m in host.items)
                              PopupMenuItem(
                                value: m,
                                child: Row(children: [Icon(m.icon, size: 20, color: MC.n600), const SizedBox(width: 12), Text(m.label, style: MT.body)]),
                              ),
                          ],
                        ),
                ),
                IconBtn(icon: Icons.refresh, onTap: onRefresh, tooltip: t('refresh')),
                IconBtn(icon: Icons.settings_outlined, onTap: onSettings, tooltip: t('settings')),
                IconBtn(icon: Icons.logout, onTap: onAccount, tooltip: t('logout')),
                const SizedBox(width: 4),
              ]),
            ),
          ),
        ),
      );
}

class _StatusBar extends StatefulWidget {
  const _StatusBar({required this.session, required this.mode});
  final Session session;
  final String mode;
  @override
  State<_StatusBar> createState() => _StatusBarState();
}

class _StatusBarState extends State<_StatusBar> {
  late final Timer _timer;
  String _time = DateFormat('HH:mm:ss').format(DateTime.now());

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _time = DateFormat('HH:mm:ss').format(DateTime.now())));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    return Material(
      color: MC.card,
      child: Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: MC.border))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 38,
            child: Row(children: [
              const SizedBox(width: 12),
              const Icon(Icons.person_outline, size: 15, color: MC.n600),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  '${s.userName} · ${t('mode_${widget.mode}')} · ${s.branch?['name'] ?? ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: MT.small.copyWith(fontWeight: FontWeight.w600, color: MC.textSecondary),
                ),
              ),
              const SizedBox(width: 10),
              Container(width: 8, height: 8, decoration: BoxDecoration(color: s.online ? MC.green500 : MC.red500, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text(s.online ? t('online') : t('offline'), style: MT.small.copyWith(color: s.online ? MC.green600 : MC.red600)),
              if (s.queued > 0) Padding(padding: const EdgeInsets.only(left: 8), child: Text('↻ ${s.queued}', style: MT.small.copyWith(color: MC.amber700, fontWeight: FontWeight.w700))),
              const SizedBox(width: 10),
              Text(_time, style: MT.mono.copyWith(fontSize: 12, color: MC.textMuted)),
              const SizedBox(width: 12),
            ]),
          ),
        ),
      ),
    );
  }
}
