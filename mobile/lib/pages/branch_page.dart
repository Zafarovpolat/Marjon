import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';

class BranchPage extends StatefulWidget {
  const BranchPage({super.key});
  @override
  State<BranchPage> createState() => _BranchPageState();
}

class _BranchPageState extends State<BranchPage> {
  List<dynamic> _branches = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await Api().branches();
      if (mounted) setState(() { _branches = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Scaffold(
      key: const ValueKey('branch_page'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Row(children: [
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Marjon', style: TextStyle(
                      fontSize: 28, fontWeight: FontWeight.bold, color: AppTheme.accent)),
                    Text(state.user?['name'] ?? state.user?['email'] ?? '',
                      style: const TextStyle(color: AppTheme.textMuted)),
                  ],
                )),
                IconButton(icon: const Icon(Icons.logout), onPressed: state.logout),
              ]),
              const SizedBox(height: 24),
              const Text('Выберите филиал',
                style: TextStyle(fontSize: 18, color: AppTheme.textMuted)),
              const SizedBox(height: 16),
              Expanded(
                child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _branches.isEmpty
                    ? const Center(child: Text('Нет филиалов',
                        style: TextStyle(color: AppTheme.textMuted)))
                    : ListView.separated(
                        itemCount: _branches.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (ctx, i) {
                          final b = _branches[i];
                          return _BranchCard(
                            name: b['name'],
                            city: b['city'],
                            onTap: () => state.selectBranch(
                              Map<String, dynamic>.from(b as Map)),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BranchCard extends StatelessWidget {
  final String name;
  final String? city;
  final VoidCallback onTap;
  const _BranchCard({required this.name, this.city, required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(children: [
          const Icon(Icons.location_on_outlined, size: 32, color: AppTheme.accent),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
            if (city != null)
              Text(city!, style: const TextStyle(color: AppTheme.textMuted, fontSize: 14)),
          ])),
        ]),
      ),
    ),
  );
}
