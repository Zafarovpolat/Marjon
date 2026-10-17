import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Synchronous key-value store (SharedPreferences loaded once at startup).
/// Keys mirror the desktop terminal's localStorage keys.
class Store {
  Store._();
  static late SharedPreferences _p;

  static Future<void> init() async => _p = await SharedPreferences.getInstance();

  /// Overridable at build time: --dart-define=MARJON_API=http://127.0.0.1:8010/api/v1
  static const cloudUrl = String.fromEnvironment('MARJON_API', defaultValue: 'https://api.marjon.tech/api/v1');

  static String? get serverUrl => _p.getString('marjon_server_url');
  static set serverUrl(String? v) => _set('marjon_server_url', v);

  static String? get localDesktopIp => _p.getString('local_desktop_ip');
  static set localDesktopIp(String? v) => _set('local_desktop_ip', v);
  static String? get localDesktopToken => _p.getString('local_desktop_token');
  static set localDesktopToken(String? v) => _set('local_desktop_token', v);

  static String? get orgToken => _p.getString('marjon_org_token');
  static set orgToken(String? v) => _set('marjon_org_token', v);
  static String? get orgRefresh => _p.getString('marjon_org_refresh');
  static set orgRefresh(String? v) => _set('marjon_org_refresh', v);

  static String? get staffToken => _p.getString('marjon_token');
  static set staffToken(String? v) => _set('marjon_token', v);

  static String? get mode => _p.getString('marjon_mode');
  static set mode(String? v) => _set('marjon_mode', v);

  static int get timerYellow => _p.getInt('marjon_timer_yellow') ?? 5;
  static set timerYellow(int v) => _p.setInt('marjon_timer_yellow', v);
  static int get timerRed => _p.getInt('marjon_timer_red') ?? 10;
  static set timerRed(int v) => _p.setInt('marjon_timer_red', v);
  static bool get soundEnabled => _p.getBool('marjon_sound') ?? true;
  static set soundEnabled(bool v) => _p.setBool('marjon_sound', v);

  static bool get seenOnboarding => _p.getBool('seen_onboarding') ?? false;
  static set seenOnboarding(bool v) => _p.setBool('seen_onboarding', v);

  static String get lang => _p.getString('marjon_lang') ?? 'ru';
  static set lang(String v) => _p.setString('marjon_lang', v);

  static Map<String, dynamic>? getJson(String key) {
    final raw = _p.getString(key);
    if (raw == null) return null;
    try {
      final v = jsonDecode(raw);
      return v is Map<String, dynamic> ? v : null;
    } catch (_) {
      return null;
    }
  }

  static void setJson(String key, Object? value) =>
      value == null ? _p.remove(key) : _p.setString(key, jsonEncode(value));

  static Map<String, dynamic>? get org => getJson('marjon_org_user');
  static set org(Map<String, dynamic>? v) => setJson('marjon_org_user', v);
  static Map<String, dynamic>? get branch => getJson('marjon_branch');
  static set branch(Map<String, dynamic>? v) => setJson('marjon_branch', v);
  static Map<String, dynamic>? get staffUser => getJson('marjon_user');
  static set staffUser(Map<String, dynamic>? v) => setJson('marjon_user', v);

  // Offline GET cache + write queue (see Api)
  static String? cacheGet(String key) => _p.getString('marjon_cache_$key');
  static void cachePut(String key, String json) => _p.setString('marjon_cache_$key', json);
  static List<dynamic> get writeQueue {
    final raw = _p.getString('marjon_write_queue');
    if (raw == null) return [];
    try {
      return jsonDecode(raw) as List<dynamic>;
    } catch (_) {
      return [];
    }
  }

  static set writeQueue(List<dynamic> q) => _p.setString('marjon_write_queue', jsonEncode(q));

  static void clearTerminal() {
    for (final k in [
      'marjon_org_token', 'marjon_org_refresh', 'marjon_org_user', 'marjon_branch',
      'marjon_token', 'marjon_user', 'marjon_mode',
    ]) {
      _p.remove(k);
    }
  }

  static void clearStaff() {
    for (final k in ['marjon_token', 'marjon_user', 'marjon_mode']) {
      _p.remove(k);
    }
  }

  static void _set(String key, String? v) => v == null || v.isEmpty ? _p.remove(key) : _p.setString(key, v);
}
