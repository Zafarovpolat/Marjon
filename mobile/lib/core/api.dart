import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Api {
  static final Api _instance = Api._();
  factory Api() => _instance;

  late final Dio dio;
  String? _token;

  Api._() {
    dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 10)));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        options.baseUrl = prefs.getString('server_url') ?? 'http://localhost:8000/api/v1';
        if (_token != null) {
          options.headers['Authorization'] = 'Bearer $_token';
        }
        handler.next(options);
      },
      onError: (e, handler) async {
        if (e.response?.statusCode == 401) {
          _token = null;
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('token');
        }
        handler.next(e);
      },
    ));
  }

  void setToken(String? token) => _token = token;

  // ── Auth ──
  Future<Map<String, dynamic>> login(String login, String password) async {
    final res = await dio.post('/auth/login', data: {'email': login, 'password': password});
    return res.data;
  }

  Future<Map<String, dynamic>> me() async {
    final res = await dio.get('/auth/me');
    return res.data;
  }

  // ── Branches ──
  Future<List<dynamic>> branches() async {
    final res = await dio.get('/companies/me/branches');
    return res.data;
  }

  // ── Inventory ──
  Future<List<dynamic>> categories() async {
    final res = await dio.get('/inventory/categories');
    return res.data;
  }

  Future<List<dynamic>> products() async {
    final res = await dio.get('/inventory/products');
    return res.data;
  }

  // ── Orders ──
  Future<List<dynamic>> orders({String? branchId, String? status}) async {
    final params = <String, dynamic>{};
    if (branchId != null) params['branch_id'] = branchId;
    if (status != null) params['status'] = status;
    final res = await dio.get('/pos/orders', queryParameters: params);
    return res.data;
  }

  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> data) async {
    final res = await dio.post('/pos/orders', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> updateOrderStatus(String orderId, String status) async {
    final res = await dio.patch('/pos/orders/$orderId/status', data: {'status': status});
    return res.data;
  }

  // ── Kitchen ──
  Future<List<dynamic>> kitchenOrders(String branchId) async {
    final res = await dio.get('/kitchen/orders', queryParameters: {'branch_id': branchId});
    return res.data;
  }

  Future<void> itemDone(String itemId) async {
    await dio.patch('/kitchen/orders/items/status', data: {
      'order_item_id': itemId,
      'status': 'ready',
    });
  }

  // ── Halls & Tables ──
  Future<List<dynamic>> branchTables(String branchId) async {
    final res = await dio.get('/halls/branch/$branchId/tables');
    return res.data;
  }

  // ── Printers ──
  Future<List<dynamic>> printers() async {
    final res = await dio.get('/printers');
    return res.data;
  }

  Future<void> printReceipt(String orderId, String printerId, {int copies = 1}) async {
    await dio.post('/printers/print/receipt', data: {
      'order_id': orderId,
      'printer_id': printerId,
      'copies': copies,
    });
  }
}
