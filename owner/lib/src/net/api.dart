import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef Json = Map<String, dynamic>;

Json asJson(dynamic v) => v is Map ? v.cast<String, dynamic>() : <String, dynamic>{};
List<Json> asJsonList(dynamic v) {
  final l = v is List ? v : (v is Map ? (v['items'] ?? v['rows'] ?? v['data'] ?? const []) : const []);
  return l is List ? l.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : <Json>[];
}

class ApiError implements Exception {
  ApiError(this.message, {this.status, this.network = false});
  final String message;
  final int? status;
  final bool network;
  @override
  String toString() => message;
}

/// Owner API client: web-owner login (phone/email + password), access + refresh tokens.
class Api {
  Api._() {
    dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 12), receiveTimeout: const Duration(seconds: 30)));
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (_access != null && o.extra['auth'] != false) o.headers['Authorization'] = 'Bearer $_access';
      h.next(o);
    }));
  }
  static final Api i = Api._();

  static const baseUrl = String.fromEnvironment('MARJON_API', defaultValue: 'https://api.marjon.tech/api/v1');
  late final Dio dio;
  String? _access;
  String? _refresh;
  Future<void> Function()? onSignedOut;

  bool get hasTokens => _refresh != null;

  Future<void> restore() async {
    final p = await SharedPreferences.getInstance();
    _access = p.getString('access');
    _refresh = p.getString('refresh') ?? p.getString('token');
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    if (_access == null) {
      await p.remove('access');
      await p.remove('refresh');
      await p.remove('token');
    } else {
      await p.setString('access', _access!);
      if (_refresh != null) await p.setString('refresh', _refresh!);
    }
  }

  ApiError _wrap(Object e) {
    if (e is ApiError) return e;
    if (e is DioException) {
      final body = e.response?.data;
      String? detail;
      if (body is Map) {
        final d = body['detail'] ?? body['message'];
        detail = d is List ? d.map((x) => x is Map ? (x['msg'] ?? x).toString() : '$x').join('; ') : d?.toString();
      }
      final net = e.response == null;
      return ApiError(detail ?? (net ? 'Нет связи с сервером' : (e.message ?? 'Ошибка')), status: e.response?.statusCode, network: net);
    }
    return ApiError('$e');
  }

  Future<String>? _refreshing;
  Future<void> _doRefresh() {
    return _refreshing ??= () async {
      try {
        if (_refresh == null) throw ApiError('Сессия истекла', status: 401);
        final r = await (Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = dio.httpClientAdapter).post('/auth/refresh', data: {'refresh_token': _refresh});
        _access = r.data['access_token'] as String;
        if (r.data['refresh_token'] != null) _refresh = r.data['refresh_token'] as String;
        await _save();
        return _access!;
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<dynamic> _send(String method, String path, {Object? data, Map<String, dynamic>? query, Map<String, dynamic>? headers, bool auth = true, bool retry = true}) async {
    try {
      final r = await dio.request(path, data: data, queryParameters: query, options: Options(method: method, headers: headers, extra: {'auth': auth}));
      return r.data;
    } catch (e) {
      final err = _wrap(e);
      if (err.status == 401 && auth && retry) {
        try {
          await _doRefresh();
          return await _send(method, path, data: data, query: query, headers: headers, retry: false);
        } catch (_) {
          _access = null;
          _refresh = null;
          await _save();
          await onSignedOut?.call();
          throw ApiError('Сессия истекла, войдите снова', status: 401);
        }
      }
      throw err;
    }
  }

  Future<dynamic> get(String p, {Map<String, dynamic>? query}) => _send('GET', p, query: query);
  Future<dynamic> post(String p, {Object? data, Map<String, dynamic>? query, Map<String, dynamic>? headers}) => _send('POST', p, data: data, query: query, headers: headers);
  Future<dynamic> patch(String p, {Object? data}) => _send('PATCH', p, data: data);
  Future<dynamic> delete(String p, {Map<String, dynamic>? query}) => _send('DELETE', p, query: query);

  // ── auth ────────────────────────────────────────────────────────────────

  Future<Json> login(String login, String password) async {
    final isEmail = login.contains('@');
    final d = asJson(await _send('POST', '/auth/login', auth: false, data: {isEmail ? 'email' : 'phone': login, 'password': password}));
    _access = d['access_token'] as String;
    _refresh = d['refresh_token'] as String?;
    await _save();
    return me();
  }

  Future<Json> me() async => asJson(await get('/auth/me'));

  Future<void> logout() async {
    try {
      if (_refresh != null) await _send('POST', '/auth/logout', data: {'refresh_token': _refresh}, retry: false);
    } catch (_) {}
    _access = null;
    _refresh = null;
    await _save();
  }
}
