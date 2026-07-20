import 'dart:async';
import 'package:flutter/foundation.dart';
import '../core/api.dart';

class CashierViewModel extends ChangeNotifier {
  static const _activeStatuses = ['new', 'accepted', 'cooking', 'ready'];

  List<Map<String, dynamic>> _orders   = [];
  List<Map<String, dynamic>> _printers = [];
  bool _loading = true;
  Timer? _timer;
  String? _branchId;

  List<Map<String, dynamic>> get orders   => List.unmodifiable(_orders);
  List<Map<String, dynamic>> get printers => List.unmodifiable(_printers);
  bool get loading => _loading;

  void start(String branchId) {
    if (_branchId == branchId && !_loading) return;
    _branchId = branchId;
    _timer?.cancel();
    load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => load());
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
    } catch (_) {}
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

  List<Map<String, dynamic>> _paymentTypes = [];
  List<Map<String, dynamic>> get paymentTypes => List.unmodifiable(_paymentTypes);

  Future<void> loadPaymentTypes() async {
    try {
      final list = await Api().paymentTypes();
      _paymentTypes = List<Map<String, dynamic>>.from(list);
      notifyListeners();
    } catch (_) {}
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
