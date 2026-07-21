class AppUser {
  final String id;
  final String? name;
  final String? email;
  final String? phone;
  final List<String> roleSlugs;

  const AppUser({
    required this.id,
    this.name,
    this.email,
    this.phone,
    this.roleSlugs = const [],
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id:        json['id']?.toString() ?? '',
    name:      json['name']?.toString(),
    email:     json['email']?.toString(),
    phone:     json['phone']?.toString(),
    roleSlugs: (json['role_slugs'] as List?)?.map((e) => e.toString()).toList() ?? [],
  );

  Map<String, dynamic> toJson() => {
    'id':         id,
    if (name != null)  'name':  name,
    if (email != null) 'email': email,
    if (phone != null) 'phone': phone,
    'role_slugs': roleSlugs,
  };

  String get primaryRole => roleSlugs.isNotEmpty ? roleSlugs.first : '';
  String get displayName => name ?? email ?? phone ?? id;
}
