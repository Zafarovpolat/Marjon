class ProductCategory {
  final String id;
  final String name;
  final String? slug;

  const ProductCategory({required this.id, required this.name, this.slug});

  factory ProductCategory.fromJson(Map<String, dynamic> json) => ProductCategory(
    id:   json['id'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String?,
  );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'slug': slug};

  static List<ProductCategory> listFromJson(List<dynamic> list) =>
      list.map((e) => ProductCategory.fromJson(e as Map<String, dynamic>)).toList();
}

class Product {
  final String id;
  final String name;
  final double price;
  final String? categoryId;
  final String? unit;
  final bool isActive;
  final bool isAvailable;

  const Product({
    required this.id,
    required this.name,
    required this.price,
    this.categoryId,
    this.unit,
    this.isActive = true,
    this.isAvailable = true,
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
    id:          json['id'] as String,
    name:        json['name'] as String,
    price:       _toDouble(json['price']),
    categoryId:  json['category_id'] as String?,
    unit:        json['unit'] as String?,
    isActive:    json['is_active'] as bool? ?? true,
    isAvailable: json['is_available'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'price': price,
    'category_id': categoryId,
    'unit': unit,
    'is_active': isActive,
    'is_available': isAvailable,
  };

  static List<Product> listFromJson(List<dynamic> list) =>
      list.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
}

double _toDouble(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}
