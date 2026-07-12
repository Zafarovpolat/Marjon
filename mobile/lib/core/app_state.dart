import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';

class AppState extends ChangeNotifier {
  Map<String, dynamic>? user;
  Map<String, dynamic>? branch;
  String? mode;

  bool get isLoggedIn => user != null;
  bool get hasBranch => branch != null;
  String get branchId => branch!['id'];

  List<String> get roles => (user?['role_slugs'] as List?)?.cast<String>() ?? [];
  bool get isAdmin => roles.contains('owner') || roles.contains('admin') || (user?['is_superadmin'] == true);

  String? get autoMode {
    if (isAdmin) return null;
    if (roles.contains('cashier')) return 'cashier';
    if (roles.contains('waiter')) return 'waiter';
    if (roles.contains('kitchen')) return 'kitchen';
    if (roles.contains('bar')) return 'bar';
    return null;
  }

  String get displayName => user?['name'] ?? user?['phone'] ?? user?['email'] ?? '';

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) return;

    Api().setToken(token);
    try {
      user = await Api().me();
      final bId = prefs.getString('branch_id');
      final bName = prefs.getString('branch_name');
      if (bId != null && bName != null) {
        branch = {'id': bId, 'name': bName};
      }
    } catch (_) {
      await prefs.remove('token');
      Api().setToken(null);
    }
    notifyListeners();
  }

  Future<void> login(String serverUrl, String login, String password) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_url', serverUrl);

    final tokens = await Api().login(login, password);
    Api().setToken(tokens['access_token'] as String);
    await prefs.setString('token', tokens['access_token'] as String);

    user = await Api().me();
    branch = null;
    mode = null;
    notifyListeners();
  }

  Future<void> selectBranch(Map<String, dynamic> b) async {
    branch = b;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('branch_id', b['id']);
    await prefs.setString('branch_name', b['name']);
    if (autoMode != null) mode = autoMode;
    notifyListeners();
  }

  void selectMode(String m) {
    mode = m;
    notifyListeners();
  }

  void backToModes() {
    mode = null;
    notifyListeners();
  }

  Future<void> logout() async {
    user = null;
    branch = null;
    mode = null;
    Api().setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('branch_id');
    await prefs.remove('branch_name');
    notifyListeners();
  }
}
