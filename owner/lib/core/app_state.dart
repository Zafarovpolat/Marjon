import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';

class AppState extends ChangeNotifier {
  Map<String, dynamic>? user;
  bool get isLoggedIn => user != null;
  String get displayName => user?['name'] ?? user?['phone'] ?? user?['email'] ?? '';

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) return;
    Api().setToken(token);
    try {
      user = await Api().me();
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
    notifyListeners();
  }

  Future<void> logout() async {
    user = null;
    Api().setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    notifyListeners();
  }
}
