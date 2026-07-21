class ProductCategory {
  final String id;
  final String name;
  final String? slug;

  const ProductCategory({required this.id, required this.name, this.slug});

  factory ProductCategory.fromJson(Map<String, dynamic> json) => ProductCategory(
    id:   json['id']?.toString() ?? '',
    name: json['name']?.toString() ?? '',
    slug: json['slug']?.toString(),
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'name': name, if (slug != null) 'slug': slug,
  };
}

class Product {
  final String id;
  final String name;
  final double price;
  final double? costPrice;
  final String? description;
  final String? categoryId;
  final String? unit;
  final bool isActive;

  const Product({
    required this.id,
    required this.name,
    required this.price,
    this.costPrice,
    this.description,
    this.categoryId,
    this.unit,
    this.isActive = true,
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
    id:          json['id']?.toString() ?? '',
    name:        json['name']?.toString() ?? '',
    price:       double.tryParse(json['price']?.toString() ?? '') ?? 0.0,
    costPrice:   json['cost_price'] != null
        ? double.tryParse(json['cost_price'].toString())
        : null,
    description: json['description']?.toString(),
    categoryId:  json['category_id']?.toString(),
    unit:        json['unit']?.toString(),
    isActive:    json['is_active'] == true,
  );

  Map<String, dynamic> toJson() => {
    'id':       id,
    'name':     name,
    'price':    price,
    if (costPrice != null)    'cost_price':  costPrice,
    if (description != null)  'description': description,
    if (categoryId != null)   'category_id': categoryId,
    if (unit != null)         'unit':        unit,
    'is_active': isActive,
  };
}
