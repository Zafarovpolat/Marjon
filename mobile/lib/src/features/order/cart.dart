import '../../ui/kit.dart';

/// One line of the order being built (before it is sent to the server).
class CartLine {
  CartLine({
    required this.lineId,
    required this.product,
    required this.price,
    this.qty = 1,
    this.note = '',
    this.takeaway = false,
    this.modifiers = const [],
  });

  final String lineId;
  final Map<String, dynamic> product;
  double price; // unit price incl. selected add-ons
  double qty;
  String note;
  bool takeaway;
  List<Map<String, dynamic>> modifiers;

  String get name => '${product['name'] ?? ''}';
  double get total => price * qty;

  static int _seq = 0;
  static String nextId() => '${DateTime.now().microsecondsSinceEpoch}-${_seq++}';

  factory CartLine.of(Map<String, dynamic> product, {bool takeaway = false}) => CartLine(
        lineId: nextId(),
        product: product,
        price: toNum(product['price']).toDouble(),
        takeaway: takeaway,
      );

  Map<String, dynamic> toItemJson({bool forceTakeaway = false}) => {
        'product_id': product['id'],
        'quantity': qty,
        'note': note.isEmpty ? null : note,
        'takeaway': forceTakeaway || takeaway,
        'modifiers': modifiers,
      };
}

class Cart {
  final List<CartLine> lines = [];

  double get subtotal => lines.fold(0.0, (s, l) => s + l.total);
  double get itemCount => lines.fold(0.0, (s, l) => s + l.qty);
  bool get isEmpty => lines.isEmpty;

  /// A line with no note/modifiers is the one a grid tap adds to/adjusts —
  /// a line customized via the dish sheet stays its own separate line.
  bool _isPlain(CartLine l, String productId, bool takeaway) =>
      '${l.product['id']}' == productId && l.takeaway == takeaway && l.note.isEmpty && l.modifiers.isEmpty;

  /// Quantity of a product's plain (uncustomized) line — what the menu grid's
  /// inline +/- stepper shows and controls.
  double qtyOf(String productId, {bool takeaway = false}) =>
      lines.where((l) => _isPlain(l, productId, takeaway)).fold(0.0, (s, l) => s + l.qty);

  /// Tapping a dish again bumps its existing plain line instead of adding a
  /// second one, so the grid's qty badge and +/- stepper stay meaningful.
  void add(Map<String, dynamic> product, {bool takeaway = false}) {
    if (product['is_available'] == false || product['in_stop_list'] == true) return;
    final id = '${product['id']}';
    final i = lines.indexWhere((l) => _isPlain(l, id, takeaway));
    if (i >= 0) {
      lines[i].qty += 1;
    } else {
      lines.add(CartLine.of(product, takeaway: takeaway));
    }
  }

  void changeQty(String lineId, double delta) {
    final i = lines.indexWhere((l) => l.lineId == lineId);
    if (i < 0) return;
    lines[i].qty += delta;
    if (lines[i].qty <= 0) lines.removeAt(i);
  }

  /// -1 on a product's plain line, from the menu grid's inline stepper.
  void decrement(String productId, {bool takeaway = false}) {
    final i = lines.indexWhere((l) => _isPlain(l, productId, takeaway));
    if (i < 0) return;
    changeQty(lines[i].lineId, -1);
  }

  void remove(String lineId) => lines.removeWhere((l) => l.lineId == lineId);
  void clear() => lines.clear();
}

bool isStopped(Map<String, dynamic> p) => p['is_available'] == false || p['in_stop_list'] == true;
