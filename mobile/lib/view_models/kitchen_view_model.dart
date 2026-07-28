import 'dart:async';
import 'package:flutter/foundation.dart';
import '../core/api.dart';
import '../services/ws_service.dart';

class KitchenViewModel extends ChangeNotifier {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  Timer? _fallbackTimer;
  String? _branchId;
  final List<VoidCallback> _wsCancels = [];

  List<Map<String, dynamic>> get orders => List.unmodifiable(_orders);
  bool get loading => _loading;
  String? get error => _error;

  void start(String branchId) {
    if (_branchId == branchId && !_loading) return;
    _branchId = branchId;
    _fallbackTimer?.cancel();
    _cancelWs();
    load();
    // fallback polling every 30s if WS drops
    _fallbackTimer = Timer.periodic(const Duration(seconds: 30), (_) => load());
    // real-time via WebSocket
    WsService().connect(branchId);
    _wsCancels.addAll([
      WsService().on('new_order',           (_) => load()),
      WsService().on('order_updated',       (_) => load()),
      WsService().on('order_cancelled',     (_) => load()),
      WsService().on('item_status_changed', (_) => load()),
    ]);
  }

  Future<void> load() async {
    if (_branchId == null) return;
    try {
      final list = await Api().kitchenOrders(_branchId!);
      _orders = list.cast<Map<String, dynamic>>();
      _error = null;
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> acceptOrder(String orderId) async {
    try {
      await Api().updateOrderStatus(orderId, 'cooking');
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> markItemReady(String itemId) async {
    try {
      await Api().itemDone(itemId);
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> markOrderReady(String orderId) async {
    try {
      await Api().updateOrderStatus(orderId, 'ready');
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  void _cancelWs() {
    for (final c in _wsCancels) { c(); }
    _wsCancels.clear();
  }

  @override
  void dispose() {
    _fallbackTimer?.cancel();
    _cancelWs();
    super.dispose();
  }
}
