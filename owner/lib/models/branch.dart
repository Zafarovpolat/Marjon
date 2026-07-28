import 'dart:convert';

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
    id:       json['id']?.toString() ?? '',
    name:     json['name']?.toString() ?? '',
    address:  json['address']?.toString(),
    city:     json['city']?.toString(),
    isActive: json['is_active'] == true,
  );

  Map<String, dynamic> toJson() => {
    'id':        id,
    'name':      name,
    if (address != null) 'address': address,
    if (city != null)    'city':    city,
    'is_active': isActive,
  };

  static List<Branch> listFromJson(String body) =>
      (jsonDecode(body) as List).map((e) => Branch.fromJson(e as Map<String, dynamic>)).toList();
}
