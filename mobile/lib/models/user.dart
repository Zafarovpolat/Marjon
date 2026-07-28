class AppUser {
  final String id;
  final String? name;
  final String? email;
  final String? phone;
  final List<String> roleSlugs;
  final bool isSuperAdmin;

  const AppUser({
    required this.id,
    this.name,
    this.email,
    this.phone,
    this.roleSlugs = const [],
    this.isSuperAdmin = false,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id:           json['id'] as String,
    name:         json['name'] as String?,
    email:        json['email'] as String?,
    phone:        json['phone'] as String?,
    roleSlugs:    (json['role_slugs'] as List?)?.cast<String>() ?? [],
    isSuperAdmin: json['is_superadmin'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'phone': phone,
    'role_slugs': roleSlugs,
    'is_superadmin': isSuperAdmin,
  };

  String get displayName => name ?? email ?? phone ?? id;
  String get primaryRole => roleSlugs.isNotEmpty ? roleSlugs.first : '';

  bool get isAdmin =>
      roleSlugs.contains('owner') ||
      roleSlugs.contains('admin') ||
      isSuperAdmin;

  String? get autoMode {
    if (isAdmin) return null;
    if (roleSlugs.contains('cashier')) return 'cashier';
    if (roleSlugs.contains('waiter')) return 'waiter';
    if (roleSlugs.contains('kitchen')) return 'kitchen';
    if (roleSlugs.contains('bar')) return 'bar';
    return null;
  }
}
