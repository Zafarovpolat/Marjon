import 'package:flutter/material.dart';

import '../../core/perm.dart';
import '../../i18n/strings.dart';
import '../../session/session.dart';
import '../floor/floor_data.dart';
import '../workspace/mode_host.dart';
import 'attendance_panel.dart';
import 'batch_print_panel.dart';
import 'finance_panel.dart';
import 'history_panel.dart';
import 'reports_panel.dart';
import 'staff_panel.dart';
import 'stop_list_panel.dart';
import 'warehouse_panel.dart';

/// Sections of the "⋮" menu. Permission gating mirrors the desktop cashier.
List<ModeMenuItem> buildPanelMenu(BuildContext context, Session session, {required FloorData floor}) {
  final u = session.staffUser;
  void open(Widget Function() build) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => build()));
  return [
    if (Perm.can(u, 'can_view_stop_list')) ModeMenuItem(id: 'stop', label: t('stoplist'), icon: Icons.block, onTap: () => open(() => StopListPanel(user: u))),
    if (Perm.must(u, 'can_view_finance')) ModeMenuItem(id: 'fin', label: t('finance'), icon: Icons.account_balance_wallet_outlined, onTap: () => open(() => FinancePanel(user: u, branchId: session.branchId))),
    if (Perm.must(u, 'can_approve_attendance')) ModeMenuItem(id: 'att', label: t('attendance_page'), icon: Icons.schedule, onTap: () => open(() => AttendancePanel(user: u))),
    if (Perm.can(u, 'can_view_closed_orders')) ModeMenuItem(id: 'hist', label: t('history'), icon: Icons.history, onTap: () => open(() => HistoryPanel(branchId: session.branchId))),
    ModeMenuItem(id: 'rep', label: t('reports'), icon: Icons.bar_chart, onTap: () => open(() => ReportsPanel(user: u, branchId: session.branchId))),
    if (Perm.must(u, 'can_manage_staff')) ModeMenuItem(id: 'staff', label: t('dev_staff'), icon: Icons.groups_outlined, onTap: () => open(() => const StaffPanel())),
    if (Perm.must(u, 'can_manage_staff')) ModeMenuItem(id: 'wh', label: t('dev_warehouse'), icon: Icons.inventory_2_outlined, onTap: () => open(() => const WarehousePanel())),
    ModeMenuItem(id: 'print', label: t('print'), icon: Icons.print_outlined, onTap: () => open(() => BatchPrintPanel(branchId: session.branchId))),
  ];
}
