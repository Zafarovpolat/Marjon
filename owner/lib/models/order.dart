class Order {
  final String id;
  final int orderNumber;
  final String status;
  final double totalAmount;
  final int? tableNumber;
  final String? branchId;
  final DateTime? createdAt;
  final List<OrderItem> items;

  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalAmount,
    this.tableNumber,
    this.branchId,
    this.createdAt,
    this.items = const [],
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
    id:          json['id']?.toString() ?? '',
    orderNumber: _toInt(json['order_number']),
    status:      json['status']?.toString() ?? '',
    totalAmount: _toDouble(json['total_amount'] ?? json['total']),
    tableNumber: json['table_number'] != null ? _toInt(json['table_number']) : null,
    branchId:    json['branch_id']?.toString(),
    createdAt:   json['created_at'] != null
        ? DateTime.tryParse(json['created_at'].toString())
        : null,
    items: (json['items'] as List?)
        ?.map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
        .toList() ?? [],
  );

  Map<String, dynamic> toJson() => {
    'id':           id,
    'order_number': orderNumber,
    'status':       status,
    'total_amount': totalAmount,
    if (tableNumber != null) 'table_number': tableNumber,
    if (branchId != null)    'branch_id':    branchId,
    if (createdAt != null)   'created_at':   createdAt!.toIso8601String(),
    'items': items.map((i) => i.toJson()).toList(),
  };

  static double _toDouble(dynamic v) =>
      double.tryParse(v?.toString() ?? '') ?? 0.0;

  static int _toInt(dynamic v) =>
      int.tryParse(v?.toString() ?? '') ?? 0;
}

class OrderItem {
  final String id;
  final String name;
  final int quantity;
  final double total;

  const OrderItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.total,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
    id:       json['id']?.toString() ?? '',
    name:     json['name']?.toString() ?? '',
    quantity: int.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    total:    double.tryParse(json['total']?.toString() ?? '') ?? 0.0,
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'name': name, 'quantity': quantity, 'total': total,
  };
}
