import 'dart:async';
import 'package:flutter/foundation.dart';
import '../core/api.dart';
import '../services/ws_service.dart';

class WaiterViewModel extends ChangeNotifier {
  static const _activeStatuses = ['new', 'accepted', 'cooking', 'ready'];

  List<Map<String, dynamic>> _orders   = [];
  List<Map<String, dynamic>> _printers = [];
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
    _fallbackTimer = Timer.periodic(const Duration(seconds: 30), (_) => load());
    WsService().connect(branchId);
    _wsCancels.addAll([
      WsService().on('new_order',       (_) => load()),
      WsService().on('order_updated',   (_) => load()),
      WsService().on('order_cancelled', (_) => load()),
    ]);
  }

  Future<void> load() async {
    if (_branchId == null) return;
    try {
      final results = await Future.wait([
        Api().orders(branchId: _branchId),
        Api().printers(),
      ]);
      _orders   = List<Map<String, dynamic>>.from(
          results[0].where((o) => _activeStatuses.contains(o['status'])));
      _printers = List<Map<String, dynamic>>.from(results[1]);
      _error = null;
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Map<String, dynamic>? findReceiptPrinter() => _printers.where(
    (p) => p['printer_type'] == 'receipt' && p['branch_id'] == _branchId,
  ).firstOrNull;

  Future<bool> printReceipt(String orderId) async {
    final printer = findReceiptPrinter();
    if (printer == null) return false;
    try {
      await Api().printReceipt(orderId, printer['id'] as String);
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
