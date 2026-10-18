import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import 'store.dart';

/// Server error carrying the backend's `detail` message and HTTP status.
class ApiError implements Exception {
  final String message;
  final int? status;
  final bool network;
  ApiError(this.message, {this.status, this.network = false});
  @override
  String toString() => message;
}

/// Port of desktop/src/shared/api.js: base URL / local-desktop proxy routing,
/// staff-or-terminal bearer selection, terminal-token refresh, offline GET cache
/// and offline write queue.
class Api {
  Api._() {
    dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
    ));
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      o.baseUrl = baseUrl;
      final local = (Store.localDesktopIp ?? '').trim();
      if (local.isNotEmpty) {
        final t = (Store.localDesktopToken ?? '').trim();
        if (t.isNotEmpty) o.headers['X-Local-Token'] = t;
      }
      if (o.extra['orgToken'] == true) {
        // No shared terminal in the personal-device login model: these calls
        // ride on the signed-in employee's own token when no terminal one exists.
        final t = o.extra['tokenOverride'] as String? ?? Store.orgToken ?? Store.staffToken;
        if (t != null) o.headers['Authorization'] = 'Bearer $t';
      } else if (o.extra['tokenOverride'] != null) {
        o.headers['Authorization'] = 'Bearer ${o.extra['tokenOverride']}';
      } else if (o.headers['Authorization'] == null) {
        final t = Store.staffToken ?? Store.orgToken;
        if (t != null) o.headers['Authorization'] = 'Bearer $t';
      }
      h.next(o);
    }));
  }

  static final Api i = Api._();
  late final Dio dio;

  /// Fired when the write queue size changes.
  final queueSize = StreamController<int>.broadcast();
  /// Called when a staff session token is rejected (session expired).
  void Function()? onStaffUnauthorized;

  String get baseUrl {
    final local = (Store.localDesktopIp ?? '').trim();
    if (local.isNotEmpty) return 'http://$local:8765/api/v1';
    return (Store.serverUrl ?? Store.cloudUrl).replaceAll(RegExp(r'/+$'), '');
  }

  // ── plumbing ─────────────────────────────────────────────────────────────

  ApiError _wrap(Object e) {
    if (e is ApiError) return e;
    if (e is DioException) {
      final code = e.response?.statusCode;
      final body = e.response?.data;
      String? detail;
      if (body is Map) {
        final d = body['detail'] ?? body['message'];
        if (d is List) {
          detail = d.map((x) => x is Map ? (x['msg'] ?? x).toString() : x.toString()).join('; ');
        } else {
          detail = d?.toString();
        }
      }
      final net = e.response == null;
      return ApiError(detail ?? (net ? 'Нет связи с сервером' : (e.message ?? 'Ошибка')), status: code, network: net);
    }
    return ApiError(e.toString());
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool org = false,
    String? tokenOverride,
    Map<String, dynamic>? headers,
  }) async {
    try {
      final r = await dio.request(
        path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: headers,
          extra: {'orgToken': org, if (tokenOverride != null) 'tokenOverride': tokenOverride},
        ),
      );
      return r.data;
    } catch (e) {
      final err = _wrap(e);
      if (err.status == 401 && !org && tokenOverride == null && Store.staffToken != null &&
          !path.startsWith('/auth/login') && !path.startsWith('/auth/pin-login') && !path.startsWith('/auth/branch-login')) {
        onStaffUnauthorized?.call();
      }
      throw err;
    }
  }

  Future<dynamic> get(String p, {Map<String, dynamic>? query}) => _send('GET', p, query: query);
  Future<dynamic> post(String p, {Object? data, Map<String, dynamic>? query}) => _send('POST', p, data: data, query: query);
  Future<dynamic> patch(String p, {Object? data, Map<String, dynamic>? query}) => _send('PATCH', p, data: data, query: query);
  Future<dynamic> delete(String p, {Map<String, dynamic>? query}) => _send('DELETE', p, query: query);

  // Terminal (org) token: access lives ~15 min; refresh on 401 once (single in-flight).
  Future<String>? _refreshing;
  Future<String> _refreshOrg() {
    return _refreshing ??= () async {
      try {
        final rt = Store.orgRefresh;
        if (rt == null) throw ApiError('Терминал не привязан', status: 401);
        final r = await (Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = dio.httpClientAdapter).post('/auth/refresh', data: {'refresh_token': rt});
        final d = r.data as Map;
        Store.orgToken = d['access_token'] as String;
        if (d['refresh_token'] != null) Store.orgRefresh = d['refresh_token'] as String;
        return Store.orgToken!;
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<dynamic> _org(String method, String path, {Object? data, Map<String, dynamic>? query}) async {
    try {
      return await _send(method, path, data: data, query: query, org: true);
    } on ApiError catch (e) {
      if (e.status != 401) rethrow;
      final String t;
      try {
        t = await _refreshOrg();
      } catch (_) {
        throw e; // refresh impossible: report the original 401 (e.g. wrong PIN)
      }
      return _send(method, path, data: data, query: query, org: true, tokenOverride: t);
    }
  }

  // Offline GET cache: successful GETs are cached, a network failure serves the cache.
  Future<dynamic> _cached(String key, Future<dynamic> Function() call) async {
    try {
      final data = await call();
      try {
        Store.cachePut(key, jsonEncode(data));
      } catch (_) {}
      return data;
    } on ApiError catch (e) {
      if (!e.network) rethrow;
      final raw = Store.cacheGet(key);
      if (raw != null) return jsonDecode(raw);
      rethrow;
    }
  }

  // Offline write queue: network failures are queued and replayed in order.
  int get queued => Store.writeQueue.length;
  bool _flushing = false;

  Future<dynamic> _writeQueued(String method, String path, Object? data) async {
    try {
      final r = await _send(method, path, data: data);
      if (queued > 0) unawaited(flushQueue());
      return r;
    } on ApiError catch (e) {
      if (!e.network) rethrow;
      final q = Store.writeQueue..add({'m': method, 'p': path, 'd': data, 'ts': DateTime.now().millisecondsSinceEpoch});
      Store.writeQueue = q;
      queueSize.add(q.length);
      return {'queued': true};
    }
  }

  Future<int> flushQueue() async {
    if (_flushing) return 0;
    _flushing = true;
    var sent = 0;
    try {
      var q = Store.writeQueue;
      while (q.isNotEmpty) {
        final it = q.first as Map;
        try {
          await _send(it['m'] as String, it['p'] as String, data: it['d']);
          q = Store.writeQueue..removeAt(0);
          Store.writeQueue = q;
          sent++;
        } on ApiError catch (e) {
          if (e.network) break;
          q = Store.writeQueue..removeAt(0);
          Store.writeQueue = q;
        }
      }
      queueSize.add(q.length);
    } finally {
      _flushing = false;
    }
    return sent;
  }

  // ── auth ─────────────────────────────────────────────────────────────────

  /// Personal-device sign-in: the employee's own phone + password (no shared terminal, no PIN).
  Future<Map<String, dynamic>> login(String phone, String password) async =>
      Map<String, dynamic>.from(await post('/auth/login', data: {'phone': phone, 'password': password}));

  /// The signed-in employee's own branch (server scopes this to one branch per account).
  Future<List<dynamic>> myBranches() async => _asList(await get('/companies/me/branches'));

  /// Colleagues of the signed-in employee's own branch (for "move item to waiter X", etc.) —
  /// no shared terminal to carry /auth/staff-users' owner/terminal-only access.
  Future<List<dynamic>> branchColleagues() async => _asList(await get('/auth/branch-colleagues'));

  /// The signed-in user's own HR employee record (branch, position) — self-service, since
  /// GET /hr/employees is owner-only and most staff roles leave User.branch_id unset
  /// (that column is monoblock-only; a human employee's branch lives on this record).
  /// Returns null when the account has no Employee record (e.g. the owner).
  Future<Map<String, dynamic>?> myEmployee() async {
    try {
      return Map<String, dynamic>.from(await get('/hr/employees/me'));
    } on ApiError catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  Future<Map<String, dynamic>> loginByPin(String pin, String? userId) async => Map<String, dynamic>.from(
      await _org('POST', '/auth/pin-login', data: {'pin': pin, if (userId != null) 'user_id': userId}));

  /// Check a PIN without touching the current session.
  Future<Map<String, dynamic>> verifyPin(String pin, String? userId) async {
    final tokens = await loginByPin(pin, userId);
    final me = await _send('GET', '/auth/me', tokenOverride: tokens['access_token'] as String);
    return Map<String, dynamic>.from(me);
  }

  Future<Map<String, dynamic>> me() async => Map<String, dynamic>.from(await get('/auth/me'));
  Future<List<dynamic>> users() async => await get('/auth/users');
  Future<dynamic> createUser(Map<String, dynamic> p) => post('/auth/users', data: p);
  Future<dynamic> updateUser(String id, Map<String, dynamic> p) => patch('/auth/users/$id', data: p);

  Future<dynamic> activeBackground() => _org('GET', '/image-backgrounds/active');

  // ── catalog ──────────────────────────────────────────────────────────────

  Future<List<dynamic>> products() async => _asList(await _cached('products', () => get('/inventory/products')));
  Future<List<dynamic>> categories() async => _asList(await _cached('categories', () => get('/inventory/categories')));
  Future<dynamic> setAvailable(String id, bool v) => patch('/inventory/products/$id/availability', data: {'is_available': v});
  Future<dynamic> setLimit(String id, int? limit) => patch('/inventory/products/$id/limit', data: {'daily_limit': limit});
  Future<Map<String, dynamic>> recipe(String id) async => Map<String, dynamic>.from(await get('/inventory/products/$id/recipe'));

  Future<List<dynamic>> halls(String branchId) async =>
      _asList(await _cached('halls_$branchId', () => get('/halls', query: {'branch_id': branchId})));

  // ── orders ───────────────────────────────────────────────────────────────

  Future<List<dynamic>> orders({String? branchId, String? status, bool? activeOnly, String? tableNumber, String? date, int? limit}) async {
    final q = <String, dynamic>{
      if (branchId != null) 'branch_id': branchId,
      if (status != null) 'status': status,
      if (activeOnly == true) 'active_only': true,
      if (tableNumber != null) 'table_number': tableNumber,
      if (date != null) 'date': date,
      if (limit != null) 'limit': limit,
    };
    return _asList(await _cached('orders_${branchId ?? 'all'}_${activeOnly ?? ''}_${date ?? ''}', () => get('/pos/orders', query: q)));
  }

  Future<Map<String, dynamic>> order(String id) async => Map<String, dynamic>.from(await get('/pos/orders/$id'));
  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> body) async => Map<String, dynamic>.from(await post('/pos/orders', data: body));
  Future<Map<String, dynamic>> updateOrder(String id, Map<String, dynamic> body) async => Map<String, dynamic>.from(await patch('/pos/orders/$id', data: body));
  Future<Map<String, dynamic>> addItem(String orderId, Map<String, dynamic> body) async => Map<String, dynamic>.from(await post('/pos/orders/$orderId/items', data: body));
  Future<dynamic> removeItem(String orderId, String itemId, {String? reason}) =>
      delete('/pos/orders/$orderId/items/$itemId', query: reason == null ? null : {'reason': reason});
  Future<dynamic> moveItem(String orderId, String itemId, String table) =>
      post('/pos/orders/$orderId/items/$itemId/move', query: {'table': table});
  Future<dynamic> setItemWaiter(String orderId, String itemId, String waiterId, {String? reason}) =>
      patch('/pos/orders/$orderId/items/$itemId/waiter', data: {'waiter_id': waiterId, if (reason != null) 'reason': reason});
  Future<dynamic> updateOrderStatus(String id, String status) => _writeQueued('PATCH', '/pos/orders/$id/status', {'status': status});

  /// The backend only allows new → (accepted|cooking) → ready → completed. A cashier may close an order at
  /// any stage, so walk the remaining steps from the order's current status.
  Future<void> completeOrder(String id) async {
    const path = ['cooking', 'ready', 'completed'];
    var steps = path;
    try {
      final status = '${(await order(id))['status']}';
      if (status == 'completed') return;
      if (status == 'cancelled') throw ApiError('Заказ отменён');
      final i = ['new', 'accepted', 'cooking', 'ready'].indexOf(status);
      // accepted and cooking both continue with "cooking" → "ready"; new/accepted start at cooking
      steps = i >= 3 ? const ['completed'] : (status == 'cooking' ? const ['ready', 'completed'] : path);
    } on ApiError catch (e) {
      if (!e.network) rethrow;
    }
    for (final s in steps) {
      await updateOrderStatus(id, s);
    }
  }
  Future<dynamic> cancelOrder(String id, {String? password, String? comment}) => delete('/pos/orders/$id', query: {
        if (password != null && password.isNotEmpty) 'password': password,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      });

  // ── kitchen ──────────────────────────────────────────────────────────────

  Future<List<dynamic>> kitchenOrders(String branchId) async =>
      _asList(await _cached('kitchen_orders_$branchId', () => get('/kitchen/orders', query: {'branch_id': branchId})));
  Future<dynamic> itemStatus(String itemId, String status) =>
      _writeQueued('PATCH', '/kitchen/orders/items/status', {'order_item_id': itemId, 'status': status});
  Future<dynamic> orderReady(String orderId) => _writeQueued('PATCH', '/kitchen/orders/$orderId/ready', null);

  // ── shifts / finance / reports / attendance ──────────────────────────────

  Future<dynamic> currentShift(String branchId) => get('/pos/shifts/current', query: {'branch_id': branchId});
  Future<dynamic> openShift(String branchId, num openingCash) => post('/pos/shifts/open', data: {'branch_id': branchId, 'opening_cash': openingCash});
  Future<dynamic> closeShift(num closingCash) => post('/pos/shifts/close', data: {'closing_cash': closingCash});

  Future<dynamic> incomeExpense(Map<String, dynamic> q) => get('/finance/income-expense', query: q);
  Future<dynamic> addCashFlow(Map<String, dynamic> body) => post('/finance/income-expense', data: body);

  Future<dynamic> customersSearch(String q) => get('/crm/customers', query: {'q': q});

  Future<dynamic> reportSales(Map<String, dynamic> q) => get('/reports/orders', query: q);
  Future<dynamic> reportDishes(Map<String, dynamic> q) => get('/reports/dishes', query: q);
  Future<dynamic> reportWaiters(Map<String, dynamic> q) => get('/reports/waiters', query: q);
  Future<dynamic> zReport(String from, [String? to]) =>
      get('/analytics/z-report', query: {'date': from, 'date_from': from, if (to != null) 'date_to': to});

  Future<List<dynamic>> attendancePending() async => await get('/hr/attendance/pending');
  Future<dynamic> attendanceApprove(String id, bool approve, {String? note}) =>
      post('/hr/attendance/$id/approve', data: {'approve': approve, if (note != null) 'note': note});
  Future<dynamic> attendanceMark(String userId, String action) => post('/hr/attendance/mark', data: {'user_id': userId, 'action': action});
  Future<List<dynamic>> attendanceLog([String? date]) async => await get('/hr/attendance/log', query: date == null ? null : {'date': date});

  // ── warehouse / printers ─────────────────────────────────────────────────

  Future<dynamic> purchases(Map<String, dynamic> q) => get('/warehouse/purchases', query: q);
  Future<dynamic> inventoryChecks(Map<String, dynamic> q) => get('/warehouse/inventory-checks', query: q);
  Future<dynamic> writeOffs(Map<String, dynamic> q) => get('/warehouse/write-offs', query: q);
  Future<dynamic> createPurchase(Map<String, dynamic> b) => post('/warehouse/purchases', data: b);
  Future<dynamic> createWriteOff(Map<String, dynamic> b) => post('/warehouse/write-offs', data: b);
  Future<dynamic> createInventoryCheck(Map<String, dynamic> b) => post('/warehouse/inventory-checks', data: b);

  Future<List<dynamic>> printers() async => _asList(await get('/printers'));
  Future<dynamic> printReceipt(Map<String, dynamic> b) => post('/printers/print/receipt', data: b);
  Future<dynamic> printKitchen(Map<String, dynamic> b) => post('/printers/print/kitchen', data: b);
  Future<dynamic> printSummary(Map<String, dynamic> b) => post('/printers/print/summary', data: b);

  static List<dynamic> _asList(dynamic d) => d is List ? d : (d is Map ? (d['items'] as List? ?? []) : []);
}
