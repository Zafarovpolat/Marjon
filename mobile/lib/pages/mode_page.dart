import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/app_state.dart';
import '../core/theme.dart';

class ModePage extends StatelessWidget {
  const ModePage({super.key});

  static const _modes = [
    _Mode('cashier', 'Касса',    Icons.point_of_sale,       AppTheme.accent),
    _Mode('waiter',  'Официант', Icons.restaurant,          AppTheme.success),
    _Mode('kitchen', 'Кухня',    Icons.soup_kitchen,        AppTheme.danger),
    _Mode('bar',     'Бар',      Icons.local_bar,           AppTheme.purple),
  ];

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Row(children: [
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Marjon', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppTheme.accent)),
                  Text(
                    '${state.user?['name'] ?? state.user?['email']} — ${state.branch?['name']}',
                    style: const TextStyle(color: AppTheme.textMuted),
                  ),
                ],
              )),
              IconButton(icon: const Icon(Icons.logout), onPressed: state.logout),
            ]),
            const SizedBox(height: 32),
            const Text('Выберите рабочее место', style: TextStyle(fontSize: 18, color: AppTheme.textMuted)),
            const SizedBox(height: 24),
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 1.1,
                children: _modes.map((m) => _ModeCard(
                  mode: m,
                  onTap: () => state.selectMode(m.id),
                )).toList(),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Mode {
  final String id;
  final String label;
  final IconData icon;
  final Color color;
  const _Mode(this.id, this.label, this.icon, this.color);
}

class _ModeCard extends StatelessWidget {
  final _Mode mode;
  final VoidCallback onTap;
  const _ModeCard({required this.mode, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(mode.icon, size: 48, color: mode.color),
            const SizedBox(height: 12),
            Text(mode.label, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: mode.color)),
          ],
        ),
      ),
    );
  }
}
