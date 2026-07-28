class OrderItem {
  final String id;
  final String name;
  final int quantity;
  final double total;
  final String? note;
  final String status;

  const OrderItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.total,
    this.note,
    this.status = 'pending',
  });

  bool get isDone => status == 'ready';

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
    id:       json['id'] as String,
    name:     json['name'] as String,
    quantity: _toInt(json['quantity']),
    total:    _toDouble(json['total']),
    note:     json['note'] as String?,
    status:   json['status'] as String? ?? 'pending',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'quantity': quantity,
    'total': total,
    'note': note,
    'status': status,
  };
}

class Order {
  final String id;
  final String orderNumber;
  final String status;
  final double totalAmount;
  final double subtotal;
  final double discountAmount;
  final String? tableNumber;
  final String? branchId;
  final String? note;
  final String? createdAt;
  final String orderType;
  final List<OrderItem> items;

  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalAmount,
    this.subtotal = 0,
    this.discountAmount = 0,
    this.tableNumber,
    this.branchId,
    this.note,
    this.createdAt,
    this.orderType = 'dine_in',
    this.items = const [],
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
    id:             json['id'] as String,
    orderNumber:    json['order_number']?.toString() ?? '',
    status:         json['status'] as String? ?? 'new',
    totalAmount:    _toDouble(json['total_amount'] ?? json['total']),
    subtotal:       _toDouble(json['subtotal']),
    discountAmount: _toDouble(json['discount_amount']),
    tableNumber:    json['table_number']?.toString(),
    branchId:       json['branch_id'] as String?,
    note:           json['note'] as String?,
    createdAt:      json['created_at'] as String?,
    orderType:      json['order_type'] as String? ?? 'dine_in',
    items: (json['items'] as List? ?? [])
        .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'order_number': orderNumber,
    'status': status,
    'total_amount': totalAmount,
    'table_number': tableNumber,
    'branch_id': branchId,
    'note': note,
    'created_at': createdAt,
    'order_type': orderType,
    'items': items.map((e) => e.toJson()).toList(),
  };

  static List<Order> listFromJson(List<dynamic> list) =>
      list.map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
}

double _toDouble(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

int _toInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}
