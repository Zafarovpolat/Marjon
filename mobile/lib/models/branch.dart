class Branch {
  final String id;
  final String name;
  final String? address;
  final String? city;
  final bool isActive;

  const Branch({
    required this.id,
    required this.name,
    this.address,
    this.city,
    this.isActive = true,
  });

  factory Branch.fromJson(Map<String, dynamic> json) => Branch(
    id:       json['id'] as String,
    name:     json['name'] as String,
    address:  json['address'] as String?,
    city:     json['city'] as String?,
    isActive: json['is_active'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'address': address,
    'city': city,
    'is_active': isActive,
  };

  static List<Branch> listFromJson(List<dynamic> list) =>
      list.map((e) => Branch.fromJson(e as Map<String, dynamic>)).toList();
}
