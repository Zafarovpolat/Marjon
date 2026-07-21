// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appTitle => 'Marjon';

  @override
  String get loginTitle => 'Marjon';

  @override
  String get loginSubtitle => 'Терминал';

  @override
  String get loginServer => 'Адрес сервера';

  @override
  String get loginEmail => 'Email или телефон';

  @override
  String get loginPassword => 'Пароль';

  @override
  String get loginButton => 'Войти';

  @override
  String get loginError => 'Неверный логин или пароль';

  @override
  String get branchTitle => 'Выберите филиал';

  @override
  String get branchEmpty => 'Нет филиалов';

  @override
  String get modeTitle => 'Выберите рабочее место';

  @override
  String get modeCashier => 'Касса';

  @override
  String get modeWaiter => 'Официант';

  @override
  String get modeKitchen => 'Кухня';

  @override
  String get modeBar => 'Бар';

  @override
  String tabAll(int count) {
    return 'Все ($count)';
  }

  @override
  String tabNew(int count) {
    return 'Новые ($count)';
  }

  @override
  String tabAccepted(int count) {
    return 'Принятые ($count)';
  }

  @override
  String tabCooking(int count) {
    return 'Готовятся ($count)';
  }

  @override
  String tabReady(int count) {
    return 'Готовы ($count)';
  }

  @override
  String get noOrders => 'Нет заказов';

  @override
  String get noActiveOrders => 'Нет активных заказов';

  @override
  String get acceptOrder => 'Принять';

  @override
  String get cancelOrder => 'Отмена';

  @override
  String get closeOrder => 'Закрыть заказ';

  @override
  String get printReceipt => 'Печать чека';

  @override
  String get printerNotFound => 'Принтер чеков не найден';

  @override
  String get receiptSent => 'Чек отправлен';

  @override
  String get printError => 'Ошибка печати';

  @override
  String get statusUpdateError => 'Ошибка обновления статуса';

  @override
  String get orderError => 'Ошибка создания заказа';

  @override
  String get statusNew => 'Новый';

  @override
  String get statusAccepted => 'Принят';

  @override
  String get statusCooking => 'Готовится';

  @override
  String get statusReady => 'Готов';

  @override
  String get statusCompleted => 'Закрыт';

  @override
  String get statusCancelled => 'Отменён';

  @override
  String get newOrderTitle => 'Новый заказ';

  @override
  String get tableLabel => 'Стол';

  @override
  String tableNumber(String number) {
    return 'Стол $number';
  }

  @override
  String get noTable => 'Без стола (на вынос)';

  @override
  String get searchHint => 'Поиск блюда...';

  @override
  String get nothingFound => 'Ничего не найдено';

  @override
  String get allCategories => 'Все';

  @override
  String createOrderBtn(String total) {
    return 'Создать — $total сум';
  }

  @override
  String get pickTable => 'Выберите стол';

  @override
  String get noTablesAvailable => 'Нет доступных столов';

  @override
  String get noTablesHint => 'Настройте залы и столы в админ-панели';

  @override
  String get startCooking => 'Начать готовить';

  @override
  String get itemReady => 'Готово';

  @override
  String get orderReadyBtn => 'Заказ готов!';

  @override
  String orderReadyMsg(String number) {
    return 'Заказ #$number готов!';
  }

  @override
  String get liveLabel => 'LIVE';

  @override
  String get settingsTitle => 'Настройки';

  @override
  String get settingsLanguage => 'Язык';

  @override
  String get settingsRussian => 'Русский';

  @override
  String get settingsUzbek => 'O\'zbekcha';

  @override
  String get settingsEnglish => 'English';

  @override
  String get settingsConnection => 'Подключение';

  @override
  String get settingsServer => 'Сервер';

  @override
  String get settingsBranch => 'Филиал';

  @override
  String get settingsBranchNone => 'Не выбран';

  @override
  String get settingsServerNone => 'Не указан';

  @override
  String get settingsApp => 'Приложение';

  @override
  String get settingsVersion => 'Версия';

  @override
  String get settingsSwitchBranch => 'Сменить филиал';

  @override
  String get settingsLogout => 'Выйти';

  @override
  String get settingsPrivacy => 'Конфиденциальность';

  @override
  String get privacyTitle => 'Политика конфиденциальности';

  @override
  String get errorGeneric => 'Произошла ошибка';

  @override
  String get loading => 'Загрузка...';

  @override
  String itemsCount(int count) {
    return '$count позиций';
  }

  @override
  String get subtotal => 'Подытог';

  @override
  String get discount => 'Скидка';

  @override
  String get total => 'Итого';

  @override
  String get note => 'Примечание';

  @override
  String get positions => 'Позиции';

  @override
  String get sumSuffix => 'сум';

  @override
  String get backToModes => 'Назад';

  @override
  String get logout => 'Выйти';
}
