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

  /// Application title
  ///
  /// In ru, this message translates to:
  /// **'Marjon Owner'**
  String get appTitle;

  /// Bottom nav: dashboard tab
  ///
  /// In ru, this message translates to:
  /// **'Главная'**
  String get navDashboard;

  /// Bottom nav: reports tab
  ///
  /// In ru, this message translates to:
  /// **'Отчёты'**
  String get navReports;

  /// Bottom nav: staff tab
  ///
  /// In ru, this message translates to:
  /// **'Персонал'**
  String get navStaff;

  /// Bottom nav: menu tab
  ///
  /// In ru, this message translates to:
  /// **'Меню'**
  String get navMenu;

  /// Bottom nav: more tab
  ///
  /// In ru, this message translates to:
  /// **'Ещё'**
  String get navMore;

  /// No description provided for @kpiRevenue.
  ///
  /// In ru, this message translates to:
  /// **'ВЫРУЧКА ЗА ДЕНЬ'**
  String get kpiRevenue;

  /// No description provided for @kpiOrders.
  ///
  /// In ru, this message translates to:
  /// **'ЗАКАЗОВ'**
  String get kpiOrders;

  /// No description provided for @kpiAvgCheck.
  ///
  /// In ru, this message translates to:
  /// **'СРЕДНИЙ ЧЕК'**
  String get kpiAvgCheck;

  /// No description provided for @kpiIncome.
  ///
  /// In ru, this message translates to:
  /// **'ПРИХОД'**
  String get kpiIncome;

  /// No description provided for @kpiExpense.
  ///
  /// In ru, this message translates to:
  /// **'РАСХОДЫ'**
  String get kpiExpense;

  /// Delta label on KPI card
  ///
  /// In ru, this message translates to:
  /// **'vs вчера'**
  String get vsYesterday;

  /// No description provided for @loading.
  ///
  /// In ru, this message translates to:
  /// **'Загрузка...'**
  String get loading;

  /// No description provided for @errorGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Произошла ошибка'**
  String get errorGeneric;

  /// No description provided for @retry.
  ///
  /// In ru, this message translates to:
  /// **'Повторить'**
  String get retry;

  /// No description provided for @save.
  ///
  /// In ru, this message translates to:
  /// **'Сохранить'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In ru, this message translates to:
  /// **'Отмена'**
  String get cancel;

  /// No description provided for @delete.
  ///
  /// In ru, this message translates to:
  /// **'Удалить'**
  String get delete;

  /// No description provided for @edit.
  ///
  /// In ru, this message translates to:
  /// **'Редактировать'**
  String get edit;

  /// No description provided for @add.
  ///
  /// In ru, this message translates to:
  /// **'Добавить'**
  String get add;

  /// No description provided for @create.
  ///
  /// In ru, this message translates to:
  /// **'Создать'**
  String get create;

  /// No description provided for @search.
  ///
  /// In ru, this message translates to:
  /// **'Поиск'**
  String get search;

  /// No description provided for @noData.
  ///
  /// In ru, this message translates to:
  /// **'Нет данных'**
  String get noData;

  /// No description provided for @refresh.
  ///
  /// In ru, this message translates to:
  /// **'Обновить'**
  String get refresh;

  /// No description provided for @staffTitle.
  ///
  /// In ru, this message translates to:
  /// **'Сотрудники'**
  String get staffTitle;

  /// No description provided for @staffAdd.
  ///
  /// In ru, this message translates to:
  /// **'Добавить сотрудника'**
  String get staffAdd;

  /// No description provided for @staffEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет сотрудников'**
  String get staffEmpty;

  /// No description provided for @staffDeleteConfirm.
  ///
  /// In ru, this message translates to:
  /// **'Удалить сотрудника?'**
  String get staffDeleteConfirm;

  /// No description provided for @staffDeleteMsg.
  ///
  /// In ru, this message translates to:
  /// **'\'{name}\' будет удалён из системы'**
  String staffDeleteMsg(String name);

  /// No description provided for @ordersTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заказы'**
  String get ordersTitle;

  /// No description provided for @ordersEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет заказов'**
  String get ordersEmpty;

  /// No description provided for @ordersCount.
  ///
  /// In ru, this message translates to:
  /// **'{count} заказов'**
  String ordersCount(int count);

  /// No description provided for @financeTitle.
  ///
  /// In ru, this message translates to:
  /// **'Финансы'**
  String get financeTitle;

  /// No description provided for @financeIncome.
  ///
  /// In ru, this message translates to:
  /// **'Доходы'**
  String get financeIncome;

  /// No description provided for @financeExpense.
  ///
  /// In ru, this message translates to:
  /// **'Расходы'**
  String get financeExpense;

  /// No description provided for @financeBalance.
  ///
  /// In ru, this message translates to:
  /// **'Баланс'**
  String get financeBalance;

  /// No description provided for @financeAdd.
  ///
  /// In ru, this message translates to:
  /// **'Добавить'**
  String get financeAdd;

  /// No description provided for @financeEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет транзакций'**
  String get financeEmpty;

  /// No description provided for @reportsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отчёты'**
  String get reportsTitle;

  /// No description provided for @reportsDishes.
  ///
  /// In ru, this message translates to:
  /// **'Блюда'**
  String get reportsDishes;

  /// No description provided for @reportsWaiters.
  ///
  /// In ru, this message translates to:
  /// **'Официанты'**
  String get reportsWaiters;

  /// No description provided for @reportsCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отмены'**
  String get reportsCancelled;

  /// No description provided for @analyticsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Аналитика'**
  String get analyticsTitle;

  /// No description provided for @analyticsRevenue.
  ///
  /// In ru, this message translates to:
  /// **'Выручка'**
  String get analyticsRevenue;

  /// No description provided for @analyticsOrders.
  ///
  /// In ru, this message translates to:
  /// **'Заказов'**
  String get analyticsOrders;

  /// No description provided for @analyticsAvgCheck.
  ///
  /// In ru, this message translates to:
  /// **'Ср. чек'**
  String get analyticsAvgCheck;

  /// No description provided for @menuTitle.
  ///
  /// In ru, this message translates to:
  /// **'Меню'**
  String get menuTitle;

  /// No description provided for @menuAll.
  ///
  /// In ru, this message translates to:
  /// **'Все ({count})'**
  String menuAll(int count);

  /// No description provided for @branchesTitle.
  ///
  /// In ru, this message translates to:
  /// **'Филиалы'**
  String get branchesTitle;

  /// No description provided for @branchesEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет филиалов'**
  String get branchesEmpty;

  /// No description provided for @printersTitle.
  ///
  /// In ru, this message translates to:
  /// **'Принтеры'**
  String get printersTitle;

  /// No description provided for @printersEmpty.
  ///
  /// In ru, this message translates to:
  /// **'Нет принтеров'**
  String get printersEmpty;

  /// No description provided for @printerOnline.
  ///
  /// In ru, this message translates to:
  /// **'Онлайн'**
  String get printerOnline;

  /// No description provided for @printerOffline.
  ///
  /// In ru, this message translates to:
  /// **'Недоступен'**
  String get printerOffline;

  /// No description provided for @settingsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Настройки'**
  String get settingsTitle;

  /// No description provided for @settingsLogout.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get settingsLogout;

  /// No description provided for @settingsLogoutConfirm.
  ///
  /// In ru, this message translates to:
  /// **'Вы уверены, что хотите выйти?'**
  String get settingsLogoutConfirm;
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
