import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ru.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ru')
  ];

  /// No description provided for @appTitle.
  ///
  /// In ru, this message translates to:
  /// **'Marjon'**
  String get appTitle;

  /// No description provided for @loginTitle.
  ///
  /// In ru, this message translates to:
  /// **'Marjon'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Терминал'**
  String get loginSubtitle;

  /// No description provided for @loginServer.
  ///
  /// In ru, this message translates to:
  /// **'Адрес сервера'**
  String get loginServer;

  /// No description provided for @loginEmail.
  ///
  /// In ru, this message translates to:
  /// **'Email или телефон'**
  String get loginEmail;

  /// No description provided for @loginPassword.
  ///
  /// In ru, this message translates to:
  /// **'Пароль'**
  String get loginPassword;

  /// No description provided for @loginButton.
  ///
  /// In ru, this message translates to:
  /// **'Войти'**
  String get loginButton;

  /// No description provided for @loginError.
  ///
  /// In ru, this message translates to:
  /// **'Неверный логин или пароль'**
  String get loginError;

  /// No description provided for @branchTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите филиал'**
  String get branchTitle;

  /// No description provided for @branchEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет филиалов'**
  String get branchEmpty;

  /// No description provided for @modeTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите рабочее место'**
  String get modeTitle;

  /// No description provided for @modeCashier.
  ///
  /// In ru, this message translates to:
  /// **'Касса'**
  String get modeCashier;

  /// No description provided for @modeWaiter.
  ///
  /// In ru, this message translates to:
  /// **'Официант'**
  String get modeWaiter;

  /// No description provided for @modeKitchen.
  ///
  /// In ru, this message translates to:
  /// **'Кухня'**
  String get modeKitchen;

  /// No description provided for @modeBar.
  ///
  /// In ru, this message translates to:
  /// **'Бар'**
  String get modeBar;

  /// No description provided for @tabAll.
  ///
  /// In ru, this message translates to:
  /// **'Все ({count})'**
  String tabAll(int count);

  /// No description provided for @tabNew.
  ///
  /// In ru, this message translates to:
  /// **'Новые ({count})'**
  String tabNew(int count);

  /// No description provided for @tabAccepted.
  ///
  /// In ru, this message translates to:
  /// **'Принятые ({count})'**
  String tabAccepted(int count);

  /// No description provided for @tabCooking.
  ///
  /// In ru, this message translates to:
  /// **'Готовятся ({count})'**
  String tabCooking(int count);

  /// No description provided for @tabReady.
  ///
  /// In ru, this message translates to:
  /// **'Готовы ({count})'**
  String tabReady(int count);

  /// No description provided for @noOrders.
  ///
  /// In ru, this message translates to:
  /// **'Нет заказов'**
  String get noOrders;

  /// No description provided for @noActiveOrders.
  ///
  /// In ru, this message translates to:
  /// **'Нет активных заказов'**
  String get noActiveOrders;

  /// No description provided for @acceptOrder.
  ///
  /// In ru, this message translates to:
  /// **'Принять'**
  String get acceptOrder;

  /// No description provided for @cancelOrder.
  ///
  /// In ru, this message translates to:
  /// **'Отмена'**
  String get cancelOrder;

  /// No description provided for @closeOrder.
  ///
  /// In ru, this message translates to:
  /// **'Закрыть заказ'**
  String get closeOrder;

  /// No description provided for @printReceipt.
  ///
  /// In ru, this message translates to:
  /// **'Печать чека'**
  String get printReceipt;

  /// No description provided for @printerNotFound.
  ///
  /// In ru, this message translates to:
  /// **'Принтер чеков не найден'**
  String get printerNotFound;

  /// No description provided for @receiptSent.
  ///
  /// In ru, this message translates to:
  /// **'Чек отправлен'**
  String get receiptSent;

  /// No description provided for @printError.
  ///
  /// In ru, this message translates to:
  /// **'Ошибка печати'**
  String get printError;

  /// No description provided for @statusUpdateError.
  ///
  /// In ru, this message translates to:
  /// **'Ошибка обновления статуса'**
  String get statusUpdateError;

  /// No description provided for @orderError.
  ///
  /// In ru, this message translates to:
  /// **'Ошибка создания заказа'**
  String get orderError;

  /// No description provided for @statusNew.
  ///
  /// In ru, this message translates to:
  /// **'Новый'**
  String get statusNew;

  /// No description provided for @statusAccepted.
  ///
  /// In ru, this message translates to:
  /// **'Принят'**
  String get statusAccepted;

  /// No description provided for @statusCooking.
  ///
  /// In ru, this message translates to:
  /// **'Готовится'**
  String get statusCooking;

  /// No description provided for @statusReady.
  ///
  /// In ru, this message translates to:
  /// **'Готов'**
  String get statusReady;

  /// No description provided for @statusCompleted.
  ///
  /// In ru, this message translates to:
  /// **'Закрыт'**
  String get statusCompleted;

  /// No description provided for @statusCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменён'**
  String get statusCancelled;

  /// No description provided for @newOrderTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новый заказ'**
  String get newOrderTitle;

  /// No description provided for @tableLabel.
  ///
  /// In ru, this message translates to:
  /// **'Стол'**
  String get tableLabel;

  /// No description provided for @tableNumber.
  ///
  /// In ru, this message translates to:
  /// **'Стол {number}'**
  String tableNumber(String number);

  /// No description provided for @noTable.
  ///
  /// In ru, this message translates to:
  /// **'Без стола (на вынос)'**
  String get noTable;

  /// No description provided for @searchHint.
  ///
  /// In ru, this message translates to:
  /// **'Поиск блюда...'**
  String get searchHint;

  /// No description provided for @nothingFound.
  ///
  /// In ru, this message translates to:
  /// **'Ничего не найдено'**
  String get nothingFound;

  /// No description provided for @allCategories.
  ///
  /// In ru, this message translates to:
  /// **'Все'**
  String get allCategories;

  /// No description provided for @createOrderBtn.
  ///
  /// In ru, this message translates to:
  /// **'Создать — {total} сум'**
  String createOrderBtn(String total);

  /// No description provided for @pickTable.
  ///
  /// In ru, this message translates to:
  /// **'Выберите стол'**
  String get pickTable;

  /// No description provided for @noTablesAvailable.
  ///
  /// In ru, this message translates to:
  /// **'Нет доступных столов'**
  String get noTablesAvailable;

  /// No description provided for @noTablesHint.
  ///
  /// In ru, this message translates to:
  /// **'Настройте залы и столы в админ-панели'**
  String get noTablesHint;

  /// No description provided for @startCooking.
  ///
  /// In ru, this message translates to:
  /// **'Начать готовить'**
  String get startCooking;

  /// No description provided for @itemReady.
  ///
  /// In ru, this message translates to:
  /// **'Готово'**
  String get itemReady;

  /// No description provided for @orderReadyBtn.
  ///
  /// In ru, this message translates to:
  /// **'Заказ готов!'**
  String get orderReadyBtn;

  /// No description provided for @orderReadyMsg.
  ///
  /// In ru, this message translates to:
  /// **'Заказ #{number} готов!'**
  String orderReadyMsg(String number);

  /// No description provided for @liveLabel.
  ///
  /// In ru, this message translates to:
  /// **'LIVE'**
  String get liveLabel;

  /// No description provided for @settingsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Настройки'**
  String get settingsTitle;

  /// No description provided for @settingsLanguage.
  ///
  /// In ru, this message translates to:
  /// **'Язык'**
  String get settingsLanguage;

  /// No description provided for @settingsRussian.
  ///
  /// In ru, this message translates to:
  /// **'Русский'**
  String get settingsRussian;

  /// No description provided for @settingsUzbek.
  ///
  /// In ru, this message translates to:
  /// **'O\'\'zbekcha'**
  String get settingsUzbek;

  /// No description provided for @settingsEnglish.
  ///
  /// In ru, this message translates to:
  /// **'English'**
  String get settingsEnglish;

  /// No description provided for @settingsConnection.
  ///
  /// In ru, this message translates to:
  /// **'Подключение'**
  String get settingsConnection;

  /// No description provided for @settingsServer.
  ///
  /// In ru, this message translates to:
  /// **'Сервер'**
  String get settingsServer;

  /// No description provided for @settingsBranch.
  ///
  /// In ru, this message translates to:
  /// **'Филиал'**
  String get settingsBranch;

  /// No description provided for @settingsBranchNone.
  ///
  /// In ru, this message translates to:
  /// **'Не выбран'**
  String get settingsBranchNone;

  /// No description provided for @settingsServerNone.
  ///
  /// In ru, this message translates to:
  /// **'Не указан'**
  String get settingsServerNone;

  /// No description provided for @settingsApp.
  ///
  /// In ru, this message translates to:
  /// **'Приложение'**
  String get settingsApp;

  /// No description provided for @settingsVersion.
  ///
  /// In ru, this message translates to:
  /// **'Версия'**
  String get settingsVersion;

  /// No description provided for @settingsSwitchBranch.
  ///
  /// In ru, this message translates to:
  /// **'Сменить филиал'**
  String get settingsSwitchBranch;

  /// No description provided for @settingsLogout.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get settingsLogout;

  /// No description provided for @settingsPrivacy.
  ///
  /// In ru, this message translates to:
  /// **'Конфиденциальность'**
  String get settingsPrivacy;

  /// No description provided for @privacyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Политика конфиденциальности'**
  String get privacyTitle;

  /// No description provided for @errorGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Произошла ошибка'**
  String get errorGeneric;

  /// No description provided for @loading.
  ///
  /// In ru, this message translates to:
  /// **'Загрузка...'**
  String get loading;

  /// No description provided for @itemsCount.
  ///
  /// In ru, this message translates to:
  /// **'{count} позиций'**
  String itemsCount(int count);

  /// No description provided for @subtotal.
  ///
  /// In ru, this message translates to:
  /// **'Подытог'**
  String get subtotal;

  /// No description provided for @discount.
  ///
  /// In ru, this message translates to:
  /// **'Скидка'**
  String get discount;

  /// No description provided for @total.
  ///
  /// In ru, this message translates to:
  /// **'Итого'**
  String get total;

  /// No description provided for @note.
  ///
  /// In ru, this message translates to:
  /// **'Примечание'**
  String get note;

  /// No description provided for @positions.
  ///
  /// In ru, this message translates to:
  /// **'Позиции'**
  String get positions;

  /// No description provided for @sumSuffix.
  ///
  /// In ru, this message translates to:
  /// **'сум'**
  String get sumSuffix;

  /// No description provided for @backToModes.
  ///
  /// In ru, this message translates to:
  /// **'Назад'**
  String get backToModes;

  /// No description provided for @logout.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get logout;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['ru'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ru': return AppLocalizationsRu();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
