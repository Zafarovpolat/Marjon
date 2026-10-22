import 'dart:async';

import 'package:flutter/material.dart';

import '../../net/api.dart';

const kActiveStatuses = {'new', 'accepted', 'cooking', 'ready', 'pending'};

enum TableState { free, busy, ready, await }

typedef Json = Map<String, dynamic>;

Json asJson(dynamic v) => v is Map ? v.cast<String, dynamic>() : <String, dynamic>{};
List<Json> asJsonList(dynamic v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : <Json>[];

IconData zoneIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('террас')) return Icons.wb_sunny_outlined;
  if (n.contains('бар')) return Icons.wine_bar_outlined;
  if (n.contains('кабин')) return Icons.meeting_room_outlined;
  if (n.contains('бронь') || n.contains('бран')) return Icons.event_outlined;
  return Icons.weekend_outlined;
}

/// Halls with tables + active orders of a branch, auto-refreshed every 20s.
/// Shared by the cashier and the waiter (port of their loadFloor/loadData).
class FloorData extends ChangeNotifier {
  FloorData(this.branchId) {
    load();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => load());
  }

  final String branchId;
  Timer? _timer;
  bool disposed = false;

  List<Json> halls = [];
  List<Json> orders = [];
  bool loading = true;
  bool hallsFailed = false;

  @override
  void dispose() {
    disposed = true;
    _timer?.cancel();
    super.dispose();
  }

  void _emit() {
    if (!disposed) notifyListeners();
  }

  Future<void> load() async {
    final h = Api.i.halls(branchId).then((d) {
      halls = asJsonList(d);
      hallsFailed = false;
    }).catchError((_) {
      hallsFailed = true;
    });
    final o = Api.i.orders(branchId: branchId).then((d) {
      orders = asJsonList(d).where((x) => kActiveStatuses.contains(x['status'])).toList();
    }).catchError((_) {});
    await Future.wait([h, o]);
    loading = false;
    _emit();
  }

  List<Json> get allTables => [
        for (final z in halls)
          for (final t in asJsonList(z['tables'])) {...t, 'zoneId': z['id'], 'zoneName': z['name']},
      ];

  /// Заказ для стола. TABLE-MATCH-01 (mobile): канонический ключ — table_id.
  /// Номер стола уникален только внутри зала («стол 4» есть и в ZAL, и в
  /// TERASSA), поэтому по номеру сопоставляем лишь заказы БЕЗ привязки
  /// (созданные старыми сборками) — так же, как это делает десктоп.
  /// Принимает и карту стола, и просто номер.
  Json? orderFor(dynamic table) {
    final isTable = table is Map;
    final id = isTable ? table['id'] : null;
    final number = isTable ? table['number'] : table;
    if (id != null) {
      for (final o in orders) {
        if (o['table_id'] != null && '${o['table_id']}' == '$id') return o;
      }
    }
    if (number == null) return null;
    for (final o in orders) {
      if (o['table_id'] == null && '${o['table_number']}' == '$number') return o;
    }
    return null;
  }

  TableState stateOf(dynamic table) {
    final o = orderFor(table);
    if (o == null) return TableState.free;
    if (o['receipt_printed_at'] != null) return TableState.await;
    return o['status'] == 'ready' ? TableState.ready : TableState.busy;
  }

  int freeCount(List<Json> tables) => tables.where((t) => stateOf(t) == TableState.free).length;

  /// Стол по введённому номеру — для переноса заказа.
  ///
  /// Сначала однозначный номер; если такой номер есть в нескольких залах,
  /// берём зал текущего стола заказа ([preferTableId]) — перенос почти всегда
  /// внутри зала. Если зал неизвестен, возвращаем null: между залами не гадаем
  /// (иначе заказ снова окажется без стола и пропадёт с кассы).
  Json? tableByNumber(dynamic number, {String? preferTableId}) {
    final num = '$number'.trim();
    final candidates = allTables.where((t) => '${t['number']}' == num).toList();
    if (candidates.length == 1) return candidates.first;
    if (preferTableId != null) {
      String? zone;
      for (final t in allTables) {
        if ('${t['id']}' == '$preferTableId') zone = '${t['zoneId']}';
      }
      if (zone != null) {
        for (final c in candidates) {
          if ('${c['zoneId']}' == zone) return c;
        }
      }
    }
    return null;
  }

  List<Json> ordersOfType(String type) => orders.where((o) => o['order_type'] == type).toList();

  /// Orders with no table (dine-in created without picking one, plus takeaway/
  /// delivery) — otherwise invisible: they match no table card (table_number
  /// null never equals a real number) and, for dine-in, no order-type board either.
  List<Json> get noTableOrders => orders.where((o) => o['table_number'] == null).toList();

  /// Cook / kitchen pipeline helpers
  String? currentStatus(dynamic table) => orderFor(table)?['status'] as String?;
}
