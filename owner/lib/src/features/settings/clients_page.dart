import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import '../common/resource_page.dart';
import '../common/resources.dart';

/// Settings → "Клиенты": clients/suppliers/staff/other tabs over the single
/// `/crm/counterparties` endpoint. The backend doesn't filter by `type`
/// server-side, so each tab fetches the full list and filters client-side.
class ClientsPage extends StatefulWidget {
  const ClientsPage({super.key});
  @override
  State<ClientsPage> createState() => _ClientsPageState();
}

class _ClientsPageState extends State<ClientsPage> {
  String type = 'client';
  int gen = 0;

  Future<void> _add() async {
    final ok = await push<bool>(context, ResourceForm(config: clientTypeConfig(type)));
    if (ok == true) setState(() => gen++);
  }

  Future<void> _edit(Json item) async {
    final ok = await push<bool>(context, ResourceForm(config: clientTypeConfig(type), item: item));
    if (ok == true) setState(() => gen++);
  }

  @override
  Widget build(BuildContext context) {
    final cfg = clientTypeConfig(type);
    return Scaffold(
      appBar: AppBar(title: const Text('Клиенты')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add), label: Text(cfg.createLabel)),
      body: Column(children: [
        ChipTabs(items: clientTypeLabels, value: type, onChanged: (v) => setState(() => type = v)),
        Expanded(
          child: AsyncBody<List<Json>>(
            reloadKey: '$type-$gen',
            load: () async {
              final all = asJsonList(await Api.i.get('/crm/counterparties'));
              return all.where((r) => '${r['type'] ?? r['kind'] ?? 'client'}' == type).toList();
            },
            builder: (_, rows, reload) => RefreshIndicator(
              onRefresh: reload,
              child: rows.isEmpty
                  ? ListView(children: [SizedBox(height: 300, child: EmptyState(cfg.emptyText, icon: cfg.icon))])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                      itemCount: rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final r = rows[i];
                        final sub = cfg.itemSubtitle?.call(r);
                        return Card2(
                          onTap: () => _edit(r),
                          child: Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(cfg.itemTitle(r), style: MT.body.copyWith(fontWeight: FontWeight.w600)),
                                if (sub != null && sub.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub, style: MT.small)),
                              ]),
                            ),
                            const Icon(Icons.chevron_right, color: MC.n300),
                          ]),
                        );
                      },
                    ),
            ),
          ),
        ),
      ]),
    );
  }
}
