import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../common/resource_page.dart';
import '../common/resources.dart';
import '../reports/reports_pages.dart';
import 'dish_pages.dart';

class MenuHubPage extends StatelessWidget {
  const MenuHubPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Меню')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          _row(context, Icons.restaurant_menu, 'Блюда', () => push(context, const DishesPage())),
          _row(context, Icons.category_outlined, 'Категории блюд', () => push(context, ResourcePage(dishCategoriesConfig))),
          _row(context, Icons.block, 'Стоп-лист', () => push(context, const StopListPage())),
          _row(context, Icons.pie_chart_outline, 'Продажи по блюдам', () => push(context, const ReportPage(kind: 'dishes'))),
        ]),
      );

  Widget _row(BuildContext context, IconData i, String l, VoidCallback t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card2(onTap: t, child: Row(children: [Icon(i, color: MC.teal600), const SizedBox(width: 14), Expanded(child: Text(l, style: MT.body.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right, color: MC.n300)])),
      );
}

/// Availability of dishes: switch a dish off to put it on the stop-list.
class StopListPage extends StatefulWidget {
  const StopListPage({super.key});
  @override
  State<StopListPage> createState() => _StopListPageState();
}

class _StopListPageState extends State<StopListPage> {
  List<Json> rows = [];
  bool loading = true;
  bool onlyStop = false;
  String q = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      rows = asJsonList(await Api.i.get('/inventory/products'));
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _toggle(Json p, bool available) async {
    setState(() => p['is_available'] = available);
    try {
      await Api.i.patch('/inventory/products/${p['id']}/availability', data: {'is_available': available});
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = rows.where((p) => (!onlyStop || p['is_available'] == false) && (q.isEmpty || '${p['name']}'.toLowerCase().contains(q.toLowerCase()))).toList();
    return Scaffold(
      appBar: AppBar(title: Text('Стоп-лист · ${rows.where((p) => p['is_available'] == false).length}')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(children: [
            Expanded(child: TextField(onChanged: (v) => setState(() => q = v), decoration: const InputDecoration(hintText: 'Поиск блюда', prefixIcon: Icon(Icons.search), isDense: true))),
            const SizedBox(width: 8),
            FilterChip(label: const Text('В стопе'), selected: onlyStop, showCheckmark: false, selectedColor: MC.red100, onSelected: (v) => setState(() => onlyStop = v)),
          ]),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : shown.isEmpty
                  ? const EmptyState('Ничего не найдено', icon: Icons.search_off)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: shown.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final p = shown[i];
                        final ok = p['is_available'] != false;
                        return SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${p['name']}', style: MT.body.copyWith(fontWeight: FontWeight.w600, color: ok ? MC.textPrimary : MC.red600)),
                          subtitle: Text(ok ? 'Доступно · ${fmtMoney(toNum(p['price']))}' : 'В стоп-листе', style: MT.small),
                          value: ok,
                          onChanged: (v) => _toggle(p, v),
                        );
                      },
                    ),
        ),
      ]),
    );
  }
}
