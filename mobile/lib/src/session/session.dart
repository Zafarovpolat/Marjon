import 'dart:async';

import 'package:flutter/foundation.dart';

import '../net/api.dart';
import '../net/store.dart';

const modeLabels = {'cashier': 'Касса', 'waiter': 'Официант', 'courier': 'Курьер', 'kitchen': 'Кухня'};

/// Staff session state machine: each employee signs in on their own device
/// with their own phone + password — no shared terminal, no PIN.
class Session extends ChangeNotifier {
  Session() {
    Api.i.onStaffUnauthorized = () => logoutStaff();
    _queueSub = Api.i.queueSize.stream.listen((n) {
      queued = n;
      notifyListeners();
    });
    queued = Api.i.queued;
  }

  StreamSubscription<int>? _queueSub;

  Map<String, dynamic>? branch = Store.branch;
  Map<String, dynamic>? staffUser = Store.staffUser;
  String? mode = Store.mode;

  bool online = true;
  int queued = 0;
  bool onboardingSeen = Store.seenOnboarding;

  bool get hasBranch => branch != null;
  bool get staffIn => Store.staffToken != null && staffUser != null;
  String get branchId => branch!['id'] as String;
  String get userName => (staffUser?['name'] ?? staffUser?['email'] ?? '') as String;

  void setLang(String l) {
    Store.lang = l;
    notifyListeners();
  }

  void completeOnboarding() {
    onboardingSeen = true;
    Store.seenOnboarding = true;
    notifyListeners();
  }

  static String modeForRole(Map<String, dynamic>? user) {
    final slugs = (user?['role_slugs'] as List?)?.map((e) => e.toString()) ?? const <String>[];
    for (final s in slugs) {
      switch (s.toLowerCase()) {
        case 'waiter':
          return 'waiter';
        case 'cashier':
          return 'cashier';
        case 'courier':
          return 'courier';
        case 'kitchen':
          return 'kitchen';
      }
    }
    return 'cashier';
  }

  /// Phone + password sign-in of the employee's own account; throws on bad
  /// credentials or an account with no branch assigned.
  Future<void> login(String phone, String password) async {
    final tokens = await Api.i.login(phone, password);
    Store.staffToken = tokens['access_token'] as String;
    try {
      final me = Map<String, dynamic>.from(await Api.i.me());
      var branchId = me['branch_id']?.toString();
      // User.branch_id is only ever set for the monoblock role — a human
      // employee's branch lives on their HR record instead.
      if (branchId == null || branchId.isEmpty) {
        final emp = await Api.i.myEmployee();
        branchId = emp?['branch_id']?.toString();
      }
      if (branchId == null || branchId.isEmpty) {
        throw ApiError('Ваш аккаунт не привязан к филиалу. Обратитесь к владельцу.');
      }
      Map<String, dynamic>? br;
      try {
        final list = await Api.i.myBranches();
        for (final b in list) {
          if (b is Map && '${b['id']}' == branchId) {
            br = b.cast<String, dynamic>();
            break;
          }
        }
      } catch (_) {}
      branch = br ?? {'id': branchId};
      Store.branch = branch;
      staffUser = me;
      Store.staffUser = staffUser;
      mode = modeForRole(staffUser);
      Store.mode = mode;
      notifyListeners();
    } catch (_) {
      Store.staffToken = null;
      rethrow;
    }
  }

  void switchMode(String m) {
    if (!modeLabels.containsKey(m)) return;
    mode = m;
    Store.mode = m;
    notifyListeners();
  }

  /// Full sign-out: this device belongs to one employee, so logging out clears everything.
  void logoutStaff() {
    Store.clearTerminal();
    branch = null;
    staffUser = null;
    mode = null;
    notifyListeners();
  }

  void setOnline(bool v) {
    if (online == v) return;
    online = v;
    if (v) unawaited(Api.i.flushQueue());
    notifyListeners();
  }

  @override
  void dispose() {
    _queueSub?.cancel();
    super.dispose();
  }
}
