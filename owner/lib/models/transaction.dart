class Transaction {
  final String id;
  final String direction; // 'income' | 'expense'
  final double amount;
  final String? categoryId;
  final String? categoryName;
  final String? note;
  final DateTime? createdAt;

  const Transaction({
    required this.id,
    required this.direction,
    required this.amount,
    this.categoryId,
    this.categoryName,
    this.note,
    this.createdAt,
  });

  bool get isIncome => direction == 'income';

  factory Transaction.fromJson(Map<String, dynamic> json) {
    final cat = json['category'] as Map<String, dynamic>?;
    return Transaction(
      id:           json['id']?.toString() ?? '',
      direction:    json['direction']?.toString() ?? 'income',
      amount:       double.tryParse(json['amount']?.toString() ?? '') ?? 0.0,
      categoryId:   (json['category_id'] ?? cat?['id'])?.toString(),
      categoryName: (json['category_name'] ?? cat?['name'])?.toString(),
      note:         (json['note'] ?? json['description'])?.toString(),
      createdAt:    json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id':        id,
    'direction': direction,
    'amount':    amount,
    if (categoryId != null)   'category_id': categoryId,
    if (categoryName != null) 'category_name': categoryName,
    if (note != null)         'note': note,
    if (createdAt != null)    'created_at': createdAt!.toIso8601String(),
  };
}

class TransactionCategory {
  final String id;
  final String name;

  const TransactionCategory({required this.id, required this.name});

  factory TransactionCategory.fromJson(Map<String, dynamic> json) =>
      TransactionCategory(
        id:   json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}
