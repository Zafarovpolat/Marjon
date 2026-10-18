import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../net/api.dart';
import '../../theme/tokens.dart';

/// Recipe card of a dish (ingredients with quantities) — port of RecipeModal.
Future<void> showRecipeSheet(BuildContext context, {required String productId, required String name}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RecipeSheet(productId: productId, name: name),
    );

class _RecipeSheet extends StatefulWidget {
  const _RecipeSheet({required this.productId, required this.name});
  final String productId;
  final String name;
  @override
  State<_RecipeSheet> createState() => _RecipeSheetState();
}

class _RecipeSheetState extends State<_RecipeSheet> {
  Map<String, dynamic>? data;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    Api.i.recipe(widget.productId).then((d) {
      if (mounted) setState(() => data = d);
    }).catchError((_) {}).whenComplete(() {
      if (mounted) setState(() => loading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = (data?['items'] as List?)?.whereType<Map>().toList() ?? const [];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Icon(Icons.soup_kitchen_outlined, color: MC.teal600), const SizedBox(width: 8), Expanded(child: Text('${t('tech_card')} — ${widget.name}', style: MT.h2.copyWith(fontSize: 18)))]),
        const SizedBox(height: 14),
        if (loading)
          const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
        else if (items.isEmpty)
          Text(t('recipe_empty'), style: MT.bodyMuted)
        else ...[
          if (data?['description'] != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('${data!['description']}', style: MT.bodyMuted)),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(children: [
                Expanded(child: Text('${it['ingredient_name']}', style: MT.body)),
                Text('${it['quantity']} ${it['unit'] ?? ''}', style: MT.money.copyWith(color: MC.textPrimary)),
              ]),
            ),
          const Divider(),
          Text('${t('recipe_yield')}: 1 ${data?['unit'] ?? t('portion')}', style: MT.small),
        ],
      ]),
    );
  }
}
