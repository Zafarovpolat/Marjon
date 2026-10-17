import 'package:flutter/material.dart';

import '../../net/api.dart';
import '../../theme/tokens.dart';
import '../../ui/common.dart';
import '../../ui/kit.dart';
import 'staff_pages.dart' show staffRoles;

const _moduleLabels = {
  'pos': 'Заказы',
  'inventory': 'Склад и меню',
  'payments': 'Оплаты',
  'kitchen': 'Кухня',
  'crm': 'Клиенты',
  'hr': 'Персонал',
  'analytics': 'Аналитика',
  'delivery': 'Доставка',
  'notifications': 'Уведомления',
  'audit': 'Журнал действий',
  'fiscal': 'Чеки (ОФД)',
  'subscriptions': 'Подписка',
  'printers': 'Принтеры',
  'rbac': 'Права доступа',
  'companies': 'Компания',
  'finance': 'Финансы',
};

String _moduleLabel(String module) => _moduleLabels[module] ?? module;

const _actionLabels = {
  'orders:create': 'Создание заказов',
  'orders:read': 'Просмотр заказов',
  'orders:update': 'Изменение заказов',
  'orders:cancel': 'Отмена заказов',
  'products:create': 'Добавление блюд',
  'products:read': 'Просмотр блюд',
  'products:update': 'Изменение блюд',
  'categories:create': 'Добавление категорий',
  'categories:read': 'Просмотр категорий',
  'stock:read': 'Просмотр остатков',
  'stock:write': 'Движение остатков',
  'process': 'Приём оплаты',
  'read': 'Просмотр',
  'items:update': 'Изменение позиций',
  'stations:manage': 'Станции кухни',
  'customers:read': 'Просмотр клиентов',
  'customers:write': 'Клиенты',
  'employees:read': 'Просмотр сотрудников',
  'employees:write': 'Сотрудники',
  'shifts:manage': 'Смены',
  'dashboard': 'Дашборд',
  'reports': 'Отчёты',
  'orders:manage': 'Управление доставкой',
  'couriers:manage': 'Курьеры',
  'send': 'Отправка уведомлений',
  'receipts:manage': 'Настройки чеков',
  'manage': 'Управление',
  'print': 'Печать',
  'users:manage': 'Сотрудники и роли',
  'branches:manage': 'Филиалы',
};

String _actionLabel(String action) => _actionLabels[action] ?? action;

/// Entry point: the 7 roles an owner can delegate to, each opening its own
/// permission editor. "Владелец"/"Администратор" are deliberately absent —
/// their permission sets are frozen backend-side (see rbac/service.py's
/// _assert_customizable_role) and editing them here would always 403.
class RolePermissionsPage extends StatelessWidget {
  const RolePermissionsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Права доступа')),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: ListView(
            children: [
              Text(
                'Выберите роль, чтобы включить или выключить отдельные функции для всех сотрудников с этой ролью.',
                style: TextStyle(color: MC.n500, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 14),
              ...staffRoles.entries.map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card2(
                      onTap: () => push(context, RolePermissionEditPage(roleSlug: e.key, roleName: e.value)),
                      child: Row(children: [
                        Expanded(child: Text(e.value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                        Icon(Icons.chevron_right, color: MC.n400),
                      ]),
                    ),
                  )),
            ],
          ),
        ),
      );
}

class _RolePermData {
  _RolePermData(this.roleId, this.catalog, this.granted);
  final String roleId;
  final List<Json> catalog; // permissions within the owner's own ceiling
  final Set<String> granted; // permission ids currently on this role
}

class RolePermissionEditPage extends StatefulWidget {
  const RolePermissionEditPage({super.key, required this.roleSlug, required this.roleName});
  final String roleSlug;
  final String roleName;
  @override
  State<RolePermissionEditPage> createState() => _RolePermissionEditPageState();
}

class _RolePermissionEditPageState extends State<RolePermissionEditPage> {
  final Set<String> _pending = {}; // permission ids with an in-flight toggle

  Future<_RolePermData> _load() async {
    final roles = asJsonList(await Api.i.get('/rbac/roles'));
    final role = roles.firstWhere((r) => r['slug'] == widget.roleSlug, orElse: () => const {});
    final roleId = role['id'] as String?;
    if (roleId == null) throw ApiError('Роль не найдена');

    // The catalog is global; restrict to what the owner's OWN permission
    // ceiling allows delegating (backend enforces this too — assign_permission
    // 403s beyond it — filtering client-side just avoids offering a toggle
    // that can never succeed).
    final me = (await Api.i.get('/rbac/me/permissions')) as List;
    final ceiling = me.map((e) => '$e').toSet();

    final catalogRaw = asJsonList(await Api.i.get('/rbac/permissions'));
    final catalog = catalogRaw.where((p) => ceiling.contains('${p['module']}:${p['action']}')).toList();
    catalog.sort((a, b) {
      final m = '${a['module']}'.compareTo('${b['module']}');
      return m != 0 ? m : '${a['action']}'.compareTo('${b['action']}');
    });

    final currentRaw = asJsonList(await Api.i.get('/rbac/roles/$roleId/permissions'));
    final granted = currentRaw.map((p) => '${p['id']}').toSet();

    return _RolePermData(roleId, catalog, granted);
  }

  Future<void> _toggle(_RolePermData data, Json permission, bool value) async {
    final id = '${permission['id']}';
    setState(() => _pending.add(id));
    try {
      if (value) {
        await Api.i.post('/rbac/roles/${data.roleId}/permissions', data: {'permission_id': id});
      } else {
        await Api.i.delete('/rbac/roles/${data.roleId}/permissions/$id');
      }
      if (mounted) {
        setState(() {
          value ? data.granted.add(id) : data.granted.remove(id);
          _pending.remove(id);
        });
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() => _pending.remove(id));
        toast(context, e.message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.roleName)),
        body: AsyncBody<_RolePermData>(
          load: _load,
          builder: (context, data, reload) {
            if (data.catalog.isEmpty) {
              return const EmptyState('Нет доступных прав для настройки', icon: Icons.lock_outline);
            }
            final byModule = <String, List<Json>>{};
            for (final p in data.catalog) {
              byModule.putIfAbsent('${p['module']}', () => []).add(p);
            }
            return RefreshIndicator(
              onRefresh: reload,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: byModule.entries.map((group) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Card2(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                          child: Text(_moduleLabel(group.key), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        ),
                        ...group.value.map((p) {
                          final id = '${p['id']}';
                          final checked = data.granted.contains(id);
                          final busy = _pending.contains(id);
                          return SwitchListTile(
                            dense: true,
                            value: checked,
                            onChanged: busy ? null : (v) => _toggle(data, p, v),
                            title: Text(_actionLabel('${p['action']}'), style: const TextStyle(fontSize: 14)),
                            secondary: busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : null,
                            activeThumbColor: MC.teal600,
                          );
                        }),
                      ]),
                    ),
                  );
                }).toList(),
              ),
            );
          },
        ),
      );
}
