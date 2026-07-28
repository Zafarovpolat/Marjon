import 'dart:async';
import 'package:flutter/foundation.dart';
import '../core/api.dart';
import '../services/ws_service.dart';

class CashierViewModel extends ChangeNotifier {
  static const _activeStatuses = ['new', 'accepted', 'cooking', 'ready'];

  List<Map<String, dynamic>> _orders       = [];
  List<Map<String, dynamic>> _printers     = [];
  List<Map<String, dynamic>> _paymentTypes = [];
  bool _loading = true;
  String? _error;
  Timer? _fallbackTimer;
  String? _branchId;
  final List<VoidCallback> _wsCancels = [];

  List<Map<String, dynamic>> get orders       => List.unmodifiable(_orders);
  List<Map<String, dynamic>> get printers     => List.unmodifiable(_printers);
  List<Map<String, dynamic>> get paymentTypes => List.unmodifiable(_paymentTypes);
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

  List<Map<String, dynamic>> filtered(int tabIndex) {
    if (tabIndex == 0) return _orders;
    return _orders.where((o) => o['status'] == _activeStatuses[tabIndex - 1]).toList();
  }

  Map<String, dynamic>? findReceiptPrinter() => _printers.where(
    (p) => p['printer_type'] == 'receipt' && p['branch_id'] == _branchId,
  ).firstOrNull;

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

  Future<bool> changeStatus(String orderId, String status) async {
    try {
      await Api().updateOrderStatus(orderId, status);
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

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

  Future<Map<String, dynamic>> processPayment({
    required String orderId,
    required double amount,
    required String method,
    double? cashReceived,
  }) async {
    final result = await Api().processPayment(
      orderId: orderId,
      amount: amount,
      method: method,
      cashReceived: cashReceived,
    );
    await load();
    return result;
  }

  Future<void> loadPaymentTypes() async {
    try {
      final list = await Api().paymentTypes();
      _paymentTypes = List<Map<String, dynamic>>.from(list);
      notifyListeners();
    } catch (_) {}
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
