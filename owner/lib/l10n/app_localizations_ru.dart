// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appTitle => 'Marjon Owner';

  @override
  String get navDashboard => 'Главная';

  @override
  String get navReports => 'Отчёты';

  @override
  String get navStaff => 'Персонал';

  @override
  String get navMenu => 'Меню';

  @override
  String get navMore => 'Ещё';

  @override
  String get kpiRevenue => 'ВЫРУЧКА ЗА ДЕНЬ';

  @override
  String get kpiOrders => 'ЗАКАЗОВ';

  @override
  String get kpiAvgCheck => 'СРЕДНИЙ ЧЕК';

  @override
  String get kpiIncome => 'ПРИХОД';

  @override
  String get kpiExpense => 'РАСХОДЫ';

  @override
  String get vsYesterday => 'vs вчера';

  @override
  String get loading => 'Загрузка...';

  @override
  String get errorGeneric => 'Произошла ошибка';

  @override
  String get retry => 'Повторить';

  @override
  String get save => 'Сохранить';

  @override
  String get cancel => 'Отмена';

  @override
  String get delete => 'Удалить';

  @override
  String get edit => 'Редактировать';

  @override
  String get add => 'Добавить';

  @override
  String get create => 'Создать';

  @override
  String get search => 'Поиск';

  @override
  String get noData => 'Нет данных';

  @override
  String get refresh => 'Обновить';

  @override
  String get staffTitle => 'Сотрудники';

  @override
  String get staffAdd => 'Добавить сотрудника';

  @override
  String get staffEmpty => 'Нет сотрудников';

  @override
  String get staffDeleteConfirm => 'Удалить сотрудника?';

  @override
  String staffDeleteMsg(String name) {
    return '{name} будет удалён из системы';
  }

  @override
  String get ordersTitle => 'Заказы';

  @override
  String get ordersEmpty => 'Нет заказов';

  @override
  String ordersCount(int count) {
    return '$count заказов';
  }

  @override
  String get financeTitle => 'Финансы';

  @override
  String get financeIncome => 'Доходы';

  @override
  String get financeExpense => 'Расходы';

  @override
  String get financeBalance => 'Баланс';

  @override
  String get financeAdd => 'Добавить';

  @override
  String get financeEmpty => 'Нет транзакций';

  @override
  String get reportsTitle => 'Отчёты';

  @override
  String get reportsDishes => 'Блюда';

  @override
  String get reportsWaiters => 'Официанты';

  @override
  String get reportsCancelled => 'Отмены';

  @override
  String get analyticsTitle => 'Аналитика';

  @override
  String get analyticsRevenue => 'Выручка';

  @override
  String get analyticsOrders => 'Заказов';

  @override
  String get analyticsAvgCheck => 'Ср. чек';

  @override
  String get menuTitle => 'Меню';

  @override
  String menuAll(int count) {
    return 'Все ($count)';
  }

  @override
  String get branchesTitle => 'Филиалы';

  @override
  String get branchesEmpty => 'Нет филиалов';

  @override
  String get printersTitle => 'Принтеры';

  @override
  String get printersEmpty => 'Нет принтеров';

  @override
  String get printerOnline => 'Онлайн';

  @override
  String get printerOffline => 'Недоступен';

  @override
  String get settingsTitle => 'Настройки';

  @override
  String get settingsLogout => 'Выйти';

  @override
  String get settingsLogoutConfirm => 'Вы уверены, что хотите выйти?';
}
