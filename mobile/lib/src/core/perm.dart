/// Staff permissions (port of desktop/src/shared/permissions.js).
///
/// `permissions` comes from the web admin on the user object. When it is not
/// set (current backend does not expose it) we fall back to role defaults so a
/// cashier still reaches the panels the desktop cashier has.
class Perm {
  Perm._();

  static const _cashierDefaults = {
    'can_view_finance',
    'can_approve_attendance',
    'can_view_closed_orders',
    'can_view_stop_list',
    'can_manage_orders',
    'can_close_bill',
  };

  static Set<String> _roles(Map<String, dynamic>? user) => {
        ...((user?['role_slugs'] as List?)?.map((e) => '$e'.toLowerCase()) ?? const <String>[]),
        if (user?['role_slug'] != null) '${user!['role_slug']}'.toLowerCase(),
      };

  static Map<String, dynamic>? _perms(Map<String, dynamic>? user) {
    final p = user?['permissions'];
    return p is Map && p.isNotEmpty ? p.cast<String, dynamic>() : null;
  }

  /// Soft check: allowed unless explicitly denied.
  static bool can(Map<String, dynamic>? user, String key) {
    final p = _perms(user);
    if (p == null) return true;
    return p[key] != false;
  }

  /// Strict check for risky actions: allowed only when granted explicitly, or by role default.
  static bool must(Map<String, dynamic>? user, String key) {
    final p = _perms(user);
    if (p != null) return p[key] == true;
    return _roles(user).contains('cashier') && _cashierDefaults.contains(key);
  }
}

String formatQty(dynamic value) {
  if (value == null || value == '') return '';
  final n = value is num ? value.toDouble() : double.tryParse('$value');
  if (n == null) return '$value';
  final r = (n * 100).round() / 100;
  return r == r.roundToDouble() ? r.toInt().toString() : r.toString();
}
