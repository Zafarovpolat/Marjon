import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'net/api.dart';

/// Owner session: signed in / out, current profile.
class Session extends ChangeNotifier {
  Json? user;
  bool ready = false;
  bool onboardingSeen = false;

  bool get signedIn => user != null;
  String get displayName => '${user?['name'] ?? user?['phone'] ?? user?['email'] ?? ''}';

  Future<void> init() async {
    onboardingSeen = (await SharedPreferences.getInstance()).getBool('seen_onboarding') ?? false;
    Api.i.onSignedOut = () async {
      user = null;
      notifyListeners();
    };
    await Api.i.restore();
    if (Api.i.hasTokens) {
      try {
        user = await Api.i.me();
      } catch (_) {
        user = null;
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    onboardingSeen = true;
    (await SharedPreferences.getInstance()).setBool('seen_onboarding', true);
    notifyListeners();
  }

  Future<void> login(String login, String password) async {
    user = await Api.i.login(login, password);
    notifyListeners();
  }

  Future<void> logout() async {
    await Api.i.logout();
    user = null;
    notifyListeners();
  }
}
