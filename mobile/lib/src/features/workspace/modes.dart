import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../session/session.dart';
import '../../ui/kit.dart';
import '../cashier/cashier_mode.dart';
import '../kitchen/kitchen_mode.dart';
import '../waiter/waiter_mode.dart';

/// Mode registry: role -> screen. Cashier / waiter / courier / kitchen.
Widget buildMode(String mode, Session session) {
  switch (mode) {
    case 'cashier':
      return CashierMode(session: session);
    case 'courier':
      return CashierMode(session: session, courier: true);
    case 'waiter':
      return WaiterMode(session: session);
    case 'kitchen':
      return KitchenMode(session: session);
    default:
      return EmptyState('${t('mode_$mode')} — ${t('loading')}', icon: Icons.construction_outlined);
  }
}
