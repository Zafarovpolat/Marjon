import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Api {
  static final Api _i = Api._();
  factory Api() => _i;

  late final Dio dio;
  String? _token;

  Api._() {
    dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 10)));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) async {
        final prefs = await SharedPreferences.getInstance();
        o.baseUrl = prefs.getString('server_url') ?? 'http://localhost:8000/api/v1';
        if (_token != null) o.headers['Authorization'] = 'Bearer $_token';
        h.next(o);
      },
      onError: (e, h) async {
        if (e.response?.statusCode == 401) {
          _token = null;
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('token');
        }
        h.next(e);
      },
    ));
  }

  void setToken(String? t) => _token = t;

  // Auth
  Future<Map<String, dynamic>> login(String login, String password) async =>
    (await dio.post('/auth/login', data: {'email': login, 'password': password})).data;

  Future<Map<String, dynamic>> me() async => (await dio.get('/auth/me')).data;

  Future<List<dynamic>> listUsers() async => (await dio.get('/auth/users')).data;

  Future<Map<String, dynamic>> createUser(Map<String, dynamic> data) async =>
    (await dio.post('/auth/users', data: data)).data;

  Future<void> deleteUser(String id) async => await dio.delete('/auth/users/$id');

  // Company & Branches
  Future<Map<String, dynamic>> company() async => (await dio.get('/companies/me')).data;
  Future<Map<String, dynamic>> updateCompany(Map<String, dynamic> data) async =>
    (await dio.patch('/companies/me', data: data)).data;

  Future<List<dynamic>> branches() async => (await dio.get('/companies/me/branches')).data;
  Future<Map<String, dynamic>> createBranch(Map<String, dynamic> data) async =>
    (await dio.post('/companies/me/branches', data: data)).data;
  Future<Map<String, dynamic>> updateBranch(String id, Map<String, dynamic> data) async =>
    (await dio.patch('/companies/me/branches/$id', data: data)).data;

  // Inventory
  Future<List<dynamic>> categories() async => (await dio.get('/inventory/categories')).data;
  Future<Map<String, dynamic>> createCategory(Map<String, dynamic> data) async =>
    (await dio.post('/inventory/categories', data: data)).data;

  Future<List<dynamic>> products() async => (await dio.get('/inventory/products')).data;
  Future<Map<String, dynamic>> createProduct(Map<String, dynamic> data) async =>
    (await dio.post('/inventory/products', data: data)).data;
  Future<Map<String, dynamic>> updateProduct(String id, Map<String, dynamic> data) async =>
    (await dio.patch('/inventory/products/$id', data: data)).data;

  // Orders
  Future<List<dynamic>> orders({String? branchId, String? status, String? date}) async {
    final p = <String, dynamic>{};
    if (branchId != null) p['branch_id'] = branchId;
    if (status != null) p['status'] = status;
    if (date != null) p['date'] = date;
    return (await dio.get('/pos/orders', queryParameters: p)).data;
  }

  // Halls & Tables
  Future<List<dynamic>> halls({String? branchId}) async {
    final p = <String, dynamic>{};
    if (branchId != null) p['branch_id'] = branchId;
    return (await dio.get('/halls', queryParameters: p)).data;
  }

  Future<Map<String, dynamic>> createHall(Map<String, dynamic> data) async =>
    (await dio.post('/halls', data: data)).data;
  Future<Map<String, dynamic>> updateHall(String id, Map<String, dynamic> data) async =>
    (await dio.patch('/halls/$id', data: data)).data;
  Future<void> deleteHall(String id) async => await dio.delete('/halls/$id');

  Future<List<dynamic>> hallTables(String hallId) async =>
    (await dio.get('/halls/$hallId/tables')).data;
  Future<Map<String, dynamic>> createTable(String hallId, Map<String, dynamic> data) async =>
    (await dio.post('/halls/$hallId/tables', data: data)).data;
  Future<void> deleteTable(String hallId, String tableId) async =>
    await dio.delete('/halls/$hallId/tables/$tableId');

  Future<List<dynamic>> branchTables(String branchId) async =>
    (await dio.get('/halls/branch/$branchId/tables')).data;

  // Printers
  Future<List<dynamic>> printers() async => (await dio.get('/printers')).data;
  Future<Map<String, dynamic>> createPrinter(Map<String, dynamic> data) async =>
    (await dio.post('/printers', data: data)).data;
  Future<Map<String, dynamic>> updatePrinter(String id, Map<String, dynamic> data) async =>
    (await dio.patch('/printers/$id', data: data)).data;
  Future<void> deletePrinter(String id) async => await dio.delete('/printers/$id');
  Future<Map<String, dynamic>> pingPrinter(String ip, {int port = 9100}) async =>
    (await dio.get('/printers/ping', queryParameters: {'ip': ip, 'port': port})).data;
}
