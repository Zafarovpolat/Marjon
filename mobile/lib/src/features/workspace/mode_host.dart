import 'package:flutter/material.dart';

class ModeMenuItem {
  const ModeMenuItem({required this.id, required this.label, required this.icon, required this.onTap});
  final String id;
  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

/// Lets a mode contribute its section menu (Финансы / История / Отчёты …) to the
/// shared top bar — the Flutter counterpart of the desktop's top-bar slot.
class ModeHostController extends ChangeNotifier {
  List<ModeMenuItem> _items = const [];
  List<ModeMenuItem> get items => _items;

  void setItems(List<ModeMenuItem> items) {
    _items = items;
    notifyListeners();
  }
}

class ModeHost extends InheritedWidget {
  const ModeHost({super.key, required this.controller, required super.child});
  final ModeHostController controller;

  static ModeHostController of(BuildContext context) => context.getInheritedWidgetOfExactType<ModeHost>()!.controller;

  @override
  bool updateShouldNotify(ModeHost old) => controller != old.controller;
}
