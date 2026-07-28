import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/admin/AdminApp.jsx", import.meta.url), "utf8");
const restaurantLogin = readFileSync(new URL("../src/pages/LoginPage.jsx", import.meta.url), "utf8");
const tablesReport = readFileSync(new URL("../src/pages/TablesReportPage.jsx", import.meta.url), "utf8");
const ordersReport = readFileSync(new URL("../src/pages/OrdersReportPage.jsx", import.meta.url), "utf8");
const dishesReport = readFileSync(new URL("../src/pages/DishesReportPage.jsx", import.meta.url), "utf8");
const reportDateRangePicker = readFileSync(new URL("../src/components/ReportDateRangePicker.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/admin/styles.css", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const ruLocale = readFileSync(new URL("../src/i18n/ru.json", import.meta.url), "utf8");
const unifiedShellIndex = css.lastIndexOf("Unified admin shell header/sidebar");
assert.notEqual(unifiedShellIndex, -1, "Admin CSS must include the unified shell header/sidebar block.");
const unifiedShellCss = css.slice(unifiedShellIndex);
const ownerShellIndex = css.lastIndexOf("Admin shell parity with Marjon Cafe");
assert.notEqual(ownerShellIndex, -1, "Admin CSS must include the owner shell parity block.");
const ownerShellCss = css.slice(ownerShellIndex);
const finalOwnerSizeLockIndex = css.lastIndexOf("Final admin owner dashboard size lock");
assert.notEqual(finalOwnerSizeLockIndex, -1, "Admin CSS must include the final owner dashboard size lock.");
const finalOwnerSizeLockCss = css.slice(finalOwnerSizeLockIndex);

const loginSection = app.slice(app.indexOf("function LoginView"), app.indexOf("function Sidebar"));

assert.match(loginSection, /const \[phone, setPhone\]/, "Login form must use phone state.");
assert.match(loginSection, /adminLogin\(phone, password\)/, "Login submit must send phone and password.");
assert.match(loginSection, /admin-login__field admin-login__field--phone/, "Phone field must use the compact phone structure.");
assert.match(loginSection, /admin-login__field admin-login__field--password/, "Password field must use the compact password structure.");
assert.match(loginSection, /admin-login__eye/, "Password visibility button must be rendered.");
assert.match(loginSection, /Запомнить меня/, "Remember-me control must be rendered.");
assert.match(loginSection, /Забыли пароль\?/, "Forgot-password action must be rendered.");
assert.doesNotMatch(loginSection, /<input[^>]+type="email"/, "Super admin login must not render the old email input.");
assert.doesNotMatch(loginSection, /placeholder="900000777"/, "Phone input must not show background example text.");
assert.doesNotMatch(loginSection, /placeholder="0000777"/, "Password input must not show background example text.");

const submitButtons = loginSection.match(/type="submit"/g) || [];
assert.equal(submitButtons.length, 1, "Login form must render exactly one submit button.");

assert.match(css, /\.admin-login__panel\s*{[\s\S]*?width:\s*min\(500px,\s*calc\(100vw - 32px\)\)/, "Login panel must use the requested wider 500px width.");
assert.match(css, /\.admin-login__input\s*{[\s\S]*?min-height:\s*48px/, "Login inputs must use compact height.");
assert.match(css, /\.admin-login__submit\s*{[\s\S]*?min-height:\s*50px/, "Login submit button must use compact height.");
assert.match(css, /\.admin-login__panel \.admin-login__eye\s*{[\s\S]*?background:\s*transparent/, "Eye button must stay transparent.");
assert.match(css, /\.admin-login__field--password \.admin-login__input\s*{[\s\S]*?column-gap:\s*14px/, "Password input must have spacing after the lock icon.");
assert.match(css, /\.admin-login__input input\s*{[\s\S]*?color:\s*#fff8e6/, "Login input values must be fully readable.");
assert.match(css, /\.admin-login__input input::placeholder\s*{[\s\S]*?opacity:\s*1/, "Login placeholders must not look transparent.");
assert.match(css, /url\("\.\.\/assets\/tashkent-admin-bg\.jpg"\)/, "Admin login must use the local Tashkent background asset.");
assert.doesNotMatch(css, /images\.unsplash\.com\/photo-1695220858703-4ab11b4caed7/, "Admin login must not depend on the old remote Tashkent background.");
assert.match(css, /\.admin-login__input input:-webkit-autofill[\s\S]*?rgba\(9,\s*24,\s*30,\s*0\.78\)/, "Admin login autofill must match the field background instead of drawing a black block.");
assert.match(unifiedShellCss, /--admin-shell-bar-bg:\s*#071612/, "Admin header and sidebar must share the current dark sidebar color.");
assert.match(unifiedShellCss, /\.admin-sidebar\s*{[\s\S]*?background:\s*var\(--admin-shell-bar-bg\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;/, "Admin sidebar must be solid and non-gradient.");
assert.match(unifiedShellCss, /\.admin-header\s*{[\s\S]*?background:\s*var\(--admin-shell-bar-bg\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;/, "Admin header must use the same solid color as the sidebar.");
assert.match(unifiedShellCss, /\.admin-sidebar\s*{[\s\S]*?border-right:\s*0\s*!important;/, "Admin sidebar must not show a vertical divider line.");
assert.match(unifiedShellCss, /\.admin-header\s*{[\s\S]*?border-bottom:\s*0\s*!important;/, "Admin header must not show a bottom divider line.");
assert.match(unifiedShellCss, /\.admin-main\s*{[\s\S]*?background:\s*var\(--admin-shell-page-bg\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;/, "Admin main area must not keep the old transparent gradient backdrop.");
assert.match(unifiedShellCss, /\.admin-main\s*{[\s\S]*?padding:\s*0\s*!important;/, "Admin main area must remove padding around the content.");
assert.match(unifiedShellCss, /\.admin-header\s*{[\s\S]*?margin:\s*0 0 10px\s*!important;[\s\S]*?padding:\s*14px 10px\s*!important;/, "Admin header must keep the requested 10px spacing around the content area.");
assert.match(ownerShellCss, /@media \(min-width:\s*981px\)[\s\S]*?\.admin-main\s*{[\s\S]*?padding:\s*0\s*!important;/, "Desktop owner shell main area must remove padding around the content.");
assert.match(ownerShellCss, /@media \(min-width:\s*981px\)[\s\S]*?\.admin-header\s*{[\s\S]*?margin:\s*0 0 10px\s*!important;[\s\S]*?padding:\s*14px 10px\s*!important;/, "Desktop owner shell header must keep the real 10px lower gap.");
assert.match(finalOwnerSizeLockCss, /--admin-owner-sidebar-w:\s*280px\s*!important;/, "Admin sidebar open width must allow the menu to expand.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?--admin-owner-sidebar-collapsed-w:\s*88px\s*!important;/, "Admin sidebar collapsed width must match the owner sidebar.");
assert.match(finalOwnerSizeLockCss, /--admin-owner-header-h:\s*75px\s*!important;/, "Admin header height must match the current owner topbar.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell:not\(\.is-sidebar-collapsed\) \.admin-sidebar[\s\S]*?padding:\s*0 10px 16px\s*!important;/, "Admin open sidebar must use the owner sidebar padding while animating.");
assert.match(finalOwnerSizeLockCss, /\.admin-shell \.admin-header\s*{[\s\S]*?height:\s*var\(--admin-owner-header-h\)\s*!important;[\s\S]*?padding:\s*10px 10px 12px\s*!important;/, "Admin header must use the final owner topbar sizing.");
assert.match(finalOwnerSizeLockCss, /\.admin-shell \.admin-main\s*{[\s\S]*?padding:\s*0\s*!important;/, "Admin main area must remove all padding around the content.");
assert.match(finalOwnerSizeLockCss, /\.admin-shell \.admin-main\s*{[\s\S]*?background:\s*var\(--admin-shell-bar-bg\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;/, "Admin main gap under the header must use the header bar color.");
assert.match(finalOwnerSizeLockCss, /\.admin-shell \.admin-main > \.admin-content\s*{[\s\S]*?background:\s*#eef6ff\s*!important;[\s\S]*?background-image:\s*none\s*!important;/, "Admin content area must keep the light dashboard surface.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?transition:\s*grid-template-columns 220ms ease/, "Admin sidebar toggle must copy the owner sidebar timing.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?--admin-sidebar-row-height:\s*46px[\s\S]*?--admin-sidebar-row-icon:\s*22px[\s\S]*?--admin-sidebar-row-gap:\s*14px/, "Admin category row motion variables must match the owner sidebar.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell\.is-sidebar-collapsed \.admin-sidebar \.admin-brand\.sidebar-brand[\s\S]*?left:\s*16px\s*!important;[\s\S]*?width:\s*calc\(var\(--admin-owner-sidebar-collapsed-w\) - 32px\)/, "Admin collapsed brand must use the owner left offset and width.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell \.admin-sidebar \.brand-mark[\s\S]*?position:\s*relative\s*!important;[\s\S]*?width:\s*var\(--admin-sidebar-logo-box\)\s*!important;/, "Admin sidebar logo button must stay inside the animated owner brand layout.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell\.is-sidebar-collapsed \.admin-sidebar \.brand-mark[\s\S]*?margin:\s*0\s*!important;[\s\S]*?justify-self:\s*center\s*!important;/, "Admin collapsed logo must center the same way as the owner sidebar logo.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell\.is-sidebar-collapsed \.admin-sidebar \.brand-title,\s*\.admin-shell\.is-sidebar-collapsed \.admin-sidebar \.brand-subtitle\s*{[\s\S]*?transform:\s*translateX\(-10px\)\s*!important;/, "Admin collapsed brand titles must use the same fade offset as the owner sidebar.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?grid-template-columns:\s*var\(--admin-sidebar-row-icon\) minmax\(0,\s*1fr\) var\(--admin-sidebar-row-chevron\)[\s\S]*?padding:\s*0 var\(--admin-sidebar-row-padding-x\)/, "Admin open category buttons must use the owner row grid and padding.");
assert.match(finalOwnerSizeLockCss, /Admin sidebar owner parity: exact Marjon owner collapse motion lock[\s\S]*?\.admin-shell\.is-sidebar-collapsed \.admin-sidebar \.admin-nav-group[\s\S]*?width:\s*56px\s*!important;[\s\S]*?height:\s*56px\s*!important;/, "Admin collapsed category buttons must use the owner 56px tile.");
assert.match(css, /\.admin-header__title\s*{[\s\S]*?margin-left:\s*10px\s*!important;/, "Admin back button must sit to the right of the header edge.");
assert.match(unifiedShellCss, /\.admin-main::before\s*{[\s\S]*?display:\s*none\s*!important;[\s\S]*?background:\s*none\s*!important;/, "Admin background overlay must be disabled.");
assert.match(unifiedShellCss, /\.admin-nav button\.is-active\s*{[\s\S]*?background-image:\s*linear-gradient\(135deg,\s*#1a916f 0%,\s*#157457 100%\)\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/, "Admin active sidebar button must use the current green active style without glow.");
assert.match(unifiedShellCss, /scrollbar-width:\s*none\s*!important;/, "Admin page must hide the visible scrollbar track.");
assert.match(unifiedShellCss, /::-webkit-scrollbar[\s\S]*?display:\s*none\s*!important;/, "Admin page must hide the WebKit scrollbar.");
assert.match(app, /const datePresets = useMemo/, "Admin date picker must define quick date presets.");
assert.match(app, /Сегодня[\s\S]*Вчера[\s\S]*Этот месяц[\s\S]*Этот год/, "Admin date picker must include the expected quick presets.");
assert.match(app, /<ReportDateRangePicker[\s\S]*?buttonClassName="admin-finance-date-button"/, "Admin finance header must render the shared report date picker.");
assert.match(reportDateRangePicker, /className="report-period-picker"/, "Shared admin date picker must render the date picker wrapper.");
assert.match(reportDateRangePicker, /className="report-date-menu"/, "Shared admin date picker must render a dropdown menu.");
assert.match(reportDateRangePicker, /aria-label="Предыдущий месяц"/, "Shared admin date picker must support previous-month navigation.");
assert.match(reportDateRangePicker, /aria-label="Следующий месяц"/, "Shared admin date picker must support next-month navigation.");
assert.match(reportDateRangePicker, /aria-label="Начало периода"/, "Shared admin date picker must include a start date input.");
assert.match(reportDateRangePicker, /aria-label="Конец периода"/, "Shared admin date picker must include an end date input.");
assert.match(css, /\.admin-finance-date \.report-date-menu\s*{[\s\S]*?position:\s*absolute/, "Admin finance date menu must be positioned as a dropdown.");
assert.match(css, /\.admin-finance-date \.report-date-range\s*{[\s\S]*?grid-template-columns:/, "Admin finance date range controls must be laid out cleanly.");

const restaurantPasswordInput = restaurantLogin.slice(
  restaurantLogin.indexOf('type={showPassword ? "text" : "password"}'),
  restaurantLogin.indexOf('className="login-pro-eye"')
);

assert.match(restaurantPasswordInput, /placeholder={t\("auth\.password_placeholder"\)}/, "Restaurant login password must use the localized password placeholder.");
assert.doesNotMatch(restaurantPasswordInput, /[•вЂў]{3,}/, "Restaurant login password must not show background dot text.");
assert.match(restaurantLogin, /t\("auth\.welcome_title"\)/, "Restaurant login title must use the localized title key.");
assert.match(restaurantLogin, /t\("auth\.welcome_subtitle"\)/, "Restaurant login subtitle must use the localized subtitle key.");
assert.match(restaurantLogin, /t\("auth\.remember_me"\)/, "Restaurant login remember label must use the localized remember key.");
assert.match(restaurantLogin, /t\("auth\.forgot_password"\)/, "Restaurant login forgot label must use the localized forgot-password key.");
assert.match(ruLocale, /"password_placeholder":\s*"Введите пароль"/, "Russian locale must provide a readable password placeholder.");
assert.match(ruLocale, /"welcome_title":\s*"Добро пожаловать"/, "Russian locale must provide a readable login title.");
assert.match(ruLocale, /"welcome_subtitle":\s*"Войдите в рабочее место вашего ресторана\."/, "Russian locale must provide a readable login subtitle.");
assert.match(ruLocale, /"remember_me":\s*"Запомнить меня"/, "Russian locale must provide a readable remember label.");
assert.match(ruLocale, /"forgot_password":\s*"Забыли пароль\?"/, "Russian locale must provide a readable forgot-password label.");
assert.doesNotMatch(restaurantLogin, /Р[ќџћ”’•—]/, "Restaurant login must not contain mojibake Russian text.");
assert.match(reportDateRangePicker, /className="report-period-picker"/, "Shared report period button must open a date picker wrapper.");
assert.match(reportDateRangePicker, /className="report-date-menu"/, "Shared report date picker must render a dropdown menu.");
assert.doesNotMatch(reportDateRangePicker, /report-period-nav/, "Shared report period button must not show side arrows.");
assert.match(reportDateRangePicker, /Сегодня[\s\S]*Вчера[\s\S]*Этот месяц[\s\S]*Прошлый квартал[\s\S]*Этот год/, "Shared report date picker must include the requested quick presets.");
assert.doesNotMatch(reportDateRangePicker, /Прошлый месяц|Этот квартал|Прошлый год/, "Shared report date picker must not show removed quick presets.");
assert.match(reportDateRangePicker, /type="text"/, "Shared report date picker lower fields must be text inputs so native picker does not overlap presets.");
assert.match(reportDateRangePicker, /inputMode="numeric"/, "Shared report date picker lower fields must stay numeric-friendly.");
assert.match(reportDateRangePicker, /toDateInputText/, "Shared report date picker must format report dates for compact text fields.");
assert.match(reportDateRangePicker, /fromDateInputText/, "Shared report date picker must parse compact text date values.");
assert.match(reportDateRangePicker, /updateDateTime\("start"/, "Shared report date picker must update the lower start datetime field.");
assert.doesNotMatch(reportDateRangePicker, /showPicker/, "Shared report date picker must not open the native picker over the preset menu.");
assert.match(reportDateRangePicker, /report-date-calendar-popover/, "Shared report date picker must render its own calendar outside the preset area.");
assert.match(reportDateRangePicker, /report-date-time-columns/, "Shared report date picker must split time into hour and minute columns.");
assert.match(reportDateRangePicker, /Время/, "Shared report date picker time panel must match the current localized title.");
assert.match(reportDateRangePicker, /selectHour/, "Shared report date picker must allow selecting hours separately.");
assert.match(reportDateRangePicker, /selectMinute/, "Shared report date picker must allow selecting minutes separately.");
assert.match(reportDateRangePicker, /report-date-today-button/, "Shared report date picker must include the reference Today action.");
assert.match(reportDateRangePicker, /report-date-calendar-ok/, "Shared report date picker must include the reference calendar OK action.");
assert.match(reportDateRangePicker, /className="report-date-ok"/, "Shared report date picker must keep OK as a separate action button.");
assert.doesNotMatch(reportDateRangePicker, /function MiniCalendar/, "Shared report date picker must rely on the native datetime calendar, not the old internal calendar.");
assert.doesNotMatch(reportDateRangePicker, /report-mini-calendar/, "Shared report date picker must not render the old internal mini calendar.");
assert.match(reportDateRangePicker, /applyDraft/, "Shared report date picker must apply the selected range.");
assert.match(tablesReport, /<ReportDateRangePicker[\s\S]*?value={dateRange}[\s\S]*?onChange={setDateRange}/, "Tables report must use the shared date picker.");
assert.match(ordersReport, /<ReportDateRangePicker[\s\S]*?value={dateRange}[\s\S]*?onChange={setDateRange}/, "Orders report must use the shared date picker.");
assert.match(dishesReport, /<ReportDateRangePicker[\s\S]*?value={dateRange}[\s\S]*?onChange={setDateRange}/, "Dishes report must use the shared date picker.");
const reportDatePickerCss = appCss.slice(appCss.lastIndexOf("Report date picker: compact native datetime popup"));
assert.match(appCss, /\.report-actions \.report-date-menu\s*{[\s\S]*?position:\s*absolute/, "Shared report date menu must be a dropdown.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-menu\s*{[\s\S]*?width:\s*min\(620px/, "Shared report date menu and calendar panel must have equal width.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-range\s*{[\s\S]*?position:\s*relative/, "Shared report lower date controls must stay inside the native datetime popup.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-range\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)\s*27px/, "Shared report date range fields must be laid out like the reference.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-input\s*{[\s\S]*?background:\s*#fff/, "Shared report lower date fields must stay white like the requested reference.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-input\s*{[\s\S]*?font-size:\s*12px/, "Shared report lower date fields must use compact readable digits.");
assert.doesNotMatch(reportDatePickerCss, /::-webkit-calendar-picker-indicator/, "Shared report lower date fields must not keep native calendar indicator styles.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-calendar-popover\s*{[\s\S]*?width:\s*100%/, "Shared report calendar must match the preset panel width.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-picker-body\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*190px/, "Shared report calendar must place calendar and time columns side by side.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-calendar-grid button:hover,[\s\S]*?background:\s*var\(--report-date-accent\)/, "Shared report calendar selection must use the turquoise accent.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-time-columns\s*{[\s\S]*?grid-template-columns:\s*1fr 1fr/, "Shared report time selector must show separate hour and minute columns.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-time-list button\s*{[\s\S]*?min-height:\s*42px/, "Shared report time lists must use compact selectable rows.");
assert.match(reportDatePickerCss, /\.report-actions \.report-date-calendar-footer\s*{[\s\S]*?grid-template-columns:\s*1fr 190px/, "Shared report calendar footer must match the Today and OK reference layout.");

const adminFinanceSection = app.slice(
  app.indexOf("function AdminFinanceOperationsPage"),
  app.indexOf("function AdminFinanceCategoriesPage")
);
const adminFinanceModal = app.slice(
  app.indexOf("function AdminFinanceTransactionModal"),
  app.indexOf("function AdminFinanceOperationsPage")
);
const adminFinanceFilterDrawer = app.slice(
  app.indexOf("function AdminFinanceFilterDrawer"),
  app.indexOf("function AdminFinanceOperationsPage")
);
const adminFinanceDateInput = app.slice(
  app.indexOf("function AdminFinanceDateInput"),
  app.indexOf("function AdminFinanceTransactionModal")
);
const adminFinanceCategoriesPage = app.slice(
  app.indexOf("function AdminFinanceCategoriesPage"),
  app.indexOf("function AdminIncomeCategoriesPage")
);
const adminPaymentMethodsPage = app.slice(
  app.indexOf("function AdminPaymentMethodsPage"),
  app.indexOf("function AdminFinanceHistoryPage")
);
const adminFinanceHistoryPage = app.slice(
  app.indexOf("function AdminFinanceHistoryPage"),
  app.indexOf("function AdminCashierBackgroundPage")
);

assert.match(app, /const adminFinanceApi = {[\s\S]*?createTransaction\(payload, idempotencyKey\)[\s\S]*?adminApi\.post\("\/finance\/transactions", payload/, "Admin finance must create transactions through the existing finance endpoint.");
assert.match(app, /headers:\s*{ "Idempotency-Key": idempotencyKey }/, "Admin finance submit must send an idempotency key to protect repeated requests.");
assert.match(adminFinanceSection, /if \(financeSubmitting\) return;/, "Admin finance submit must block repeated clicks while a request is in flight.");
assert.match(adminFinanceSection, /direction:\s*financeDraft\.operationType/, "Admin finance payload must send backend direction income or expense.");
assert.doesNotMatch(adminFinanceSection, /window\.confirm/, "Admin finance close confirmation must not use the native browser confirm dialog.");
assert.doesNotMatch(app, /adminFinanceDraftNeedsCloseConfirm|admin-finance-close-confirm/, "Admin finance modal must close directly without any dirty-close confirmation panel.");
assert.match(adminFinanceSection, /function requestCloseFinanceModal\(\) \{[\s\S]*?if \(financeSubmitting \|\| financeModalClosing\) return;[\s\S]*?closeFinanceModal\(\);[\s\S]*?\}/, "Admin finance close flow must close the panel directly.");
assert.match(adminFinanceSection, /financeModalClosing[\s\S]*?ADMIN_FINANCE_MODAL_ANIMATION_MS/, "Admin finance modal must keep rendering briefly for the close animation.");
assert.match(adminFinanceModal, /closing \? "is-closing" : "is-opening"/, "Admin finance modal must expose opening and closing animation states.");
assert.match(adminFinanceFilterDrawer, /className="admin-finance-filter-drawer"[\s\S]*?Выберите тип[\s\S]*?Фильтр по контрагентам[\s\S]*?Фильтр по категории[\s\S]*?Фильтровать[\s\S]*?Очистить/, "Admin finance filter button must open the requested filter drawer controls.");
assert.match(adminFinanceSection, /counterpartyFilter[\s\S]*?categoryFilter[\s\S]*?counterpartyMatches[\s\S]*?categoryMatches/, "Admin finance table must filter by counterparty and category.");
assert.match(adminFinanceSection, /<AdminFinanceFilterDrawer[\s\S]*?counterpartyOptions={filterCounterpartyOptions}[\s\S]*?categoryOptions={filterCategoryOptions}/, "Admin finance page must pass table-derived filter options to the drawer.");
assert.match(adminFinanceSection, /onNotify\?\.\(financeDraft\.operationType === "income" \? "Приход успешно добавлен"/, "Admin finance must notify after successful income creation.");
assert.match(adminFinanceSection, /catch \(error\)[\s\S]*?setFinanceSubmitError\(message\)/, "Admin finance must keep form data and show backend errors.");
assert.match(app, /function validateAdminFinanceDraft\(draft\)[\s\S]*?Введите сумму[\s\S]*?Сумма должна быть больше нуля[\s\S]*?Выберите способ оплаты[\s\S]*?Выберите филиал[\s\S]*?Выберите дату[\s\S]*?Выберите категорию/, "Admin finance validation must cover amount, payment, branch, date and category.");
assert.match(adminFinanceModal, /Добавление…/, "Admin finance submit button must show the required loading text.");
assert.match(adminFinanceModal, /maxLength={ADMIN_FINANCE_COMMENT_LIMIT}/, "Admin finance comment field must have a hard character limit.");
assert.match(app, /ADMIN_FINANCE_COUNTERPARTY_TYPES\.map/, "Admin finance modal must render counterparty type selector options.");
assert.doesNotMatch(adminFinanceDateInput, /type="date"/, "Admin finance date field must not use the native browser date picker.");
assert.match(adminFinanceDateInput, /createPortal\([\s\S]*?admin-finance-calendar[\s\S]*?document\.body/, "Admin finance date calendar must render through a portal above scrollable modal content.");
assert.match(adminFinanceDateInput, /admin-finance-calendar__today[\s\S]*?Сегодня[\s\S]*?admin-finance-calendar__ok[\s\S]*?OK/, "Admin finance date field must render the custom admin calendar footer.");
assert.match(css, /\.admin-finance-operation-dialog\s*{[\s\S]*?width:\s*min\(500px,\s*calc\(100vw - 32px\)\)/, "Admin finance modal must use the requested compact desktop width.");
assert.match(css, /\.admin-finance-operation-dialog \.admin-transaction-field\.is-invalid[\s\S]*?rgba\(220,\s*38,\s*38/, "Admin finance invalid fields must render with a red border.");
assert.match(css, /\.admin-finance-select-menu\s*{[\s\S]*?position:\s*absolute/, "Admin finance searchable select must render as a dropdown.");
assert.match(css, /\.admin-finance-calendar\s*{[\s\S]*?background:\s*#ffffff/, "Admin finance custom calendar must use the white admin popup design.");
assert.match(css, /\.admin-finance-calendar\s*{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*4090/, "Admin finance custom calendar must stay on the front layer.");
assert.match(css, /@keyframes adminFinanceOperationDialogIn[\s\S]*?translateY\(10px\)[\s\S]*?@keyframes adminFinanceOperationDialogOut[\s\S]*?translateY\(8px\)/, "Admin finance modal panel must have light open and close motion.");
assert.match(css, /\.admin-content \.admin-dashboard-grid--chart-summary\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*calc\(100% - 346px\)\) minmax\(300px,\s*336px\)\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/, "Admin dashboard chart grid must keep a stable right column while resizing.");
assert.match(css, /\.admin-content \.admin-dashboard-grid--chart-summary \.admin-center\s*{[\s\S]*?max-width:\s*100%\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/, "Admin dashboard chart center must stay constrained to its grid column.");
assert.match(css, /\.admin-content \.admin-chart-side-cards\s*{[\s\S]*?position:\s*relative\s*!important;[\s\S]*?z-index:\s*120\s*!important;[\s\S]*?max-width:\s*100%\s*!important;/, "Admin dashboard side cards must stay above the chart card background.");
assert.match(css, /\.admin-content \.admin-chart-card\s*{[\s\S]*?z-index:\s*1\s*!important;[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*100%\s*!important;/, "Admin dashboard chart card must not cover the right summary cards.");
assert.match(css, /\.admin-content \.admin-chart-card \.admin-chart\s*{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?overflow:\s*hidden\s*!important;/, "Admin dashboard chart body must clip canvas overflow on resize.");
assert.match(css, /\.admin-content \.admin-chart-card \.admin-chart canvas\s*{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*100%\s*!important;/, "Admin dashboard chart canvas must stay inside the chart card on resize.");
assert.match(adminFinanceCategoriesPage, /admin-income-page admin-finance-category-page/, "Admin finance category pages must have their own template class.");
assert.match(adminFinanceCategoriesPage, /const fallbackCategories = useMemo/, "Admin finance category pages must render their existing local rows when the API is empty or unavailable.");
assert.match(adminFinanceCategoriesPage, /setCategories\(fallbackCategories\)/, "Admin finance category pages must keep the local fallback rows in sync.");
assert.match(adminFinanceCategoriesPage, /admin-income-table-shell[\s\S]*?admin-income-list-head[\s\S]*?admin-income-list/, "Admin finance category page must render a clear table shell with column headings.");
assert.match(adminFinanceCategoriesPage, /editor\.mode === "create" \? "Добавить" : "Сохранить"/, "Admin finance category create modal must use an add action label.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-content \.admin-finance-category-page\s*{[\s\S]*?min-height:\s*0[\s\S]*?align-self:\s*start[\s\S]*?background:\s*#f4f5f5/, "Admin finance category pages must size to their rows without the empty bottom field.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-add\s*{[\s\S]*?color:\s*#111827[\s\S]*?background:\s*#ffffff/, "Admin finance category add button must match the compact white table toolbar control.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-table-shell\s*{[\s\S]*?border:\s*1px solid #dfe6ef[\s\S]*?background:\s*#ffffff/, "Admin finance category table shell must use the bordered operation table surface.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-list-head\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) 106px 76px[\s\S]*?color:\s*#f8fafc[\s\S]*?background:\s*#048453/, "Admin finance category table must show compact green column headings.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-list\s*{[\s\S]*?gap:\s*5px[\s\S]*?padding:\s*5px 0 0/, "Admin finance category rows must keep the same breathing space as operation rows.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-row\s*{[\s\S]*?min-height:\s*39px[\s\S]*?border:\s*1px solid #dfe7e3[\s\S]*?border-radius:\s*6px[\s\S]*?background:\s*#f6f7f7/, "Admin finance category rows must render as separate compact rounded rows.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-name strong\s*{[\s\S]*?font-size:\s*14px[\s\S]*?font-weight:\s*600/, "Admin finance category row names must use the requested 14px semibold text.");
assert.match(css, /Finance categories: compact money-operations table style\.[\s\S]*?\.admin-finance-category-page \.admin-income-status\s*{[\s\S]*?width:\s*106px[\s\S]*?background:\s*#e8f6ef[\s\S]*?font-size:\s*11px/, "Admin finance category status must remain readable with text.");
assert.match(css, /\.admin-finance-category-page \.admin-income-dialog\s*{[\s\S]*?width:\s*min\(500px,\s*calc\(100vw - 32px\)\)[\s\S]*?border-radius:\s*16px/, "Admin finance category modal must use the Marjon rounded admin dialog template.");
assert.match(css, /\.admin-finance-category-page \.admin-income-dialog::before\s*{[\s\S]*?linear-gradient\(90deg,\s*var\(--teal\),\s*var\(--gold-2\),\s*var\(--teal\)\)/, "Admin finance category modal must include a Marjon accent stripe.");
assert.match(adminPaymentMethodsPage, /const paymentFallbackRows = useMemo\(\(\) => paymentMethodRows\.map/, "Admin payment methods must render existing local rows when the API is empty or unavailable.");
assert.match(adminPaymentMethodsPage, /setMethods\(paymentFallbackRows\)/, "Admin payment methods must keep local fallback rows in sync.");
assert.match(adminPaymentMethodsPage, /sort:\s*Number\(r\.sort_order \?\? r\.sort \?\? index \+ 1\)/, "Admin payment API rows must preserve sort values.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-content:has\(\.admin-payment-page\)\s*{[\s\S]*?padding:\s*10px\s*!important;[\s\S]*?background:\s*#f4f5f5/, "Admin payment methods content area must show a 10px background frame around the panel.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-content \.admin-payment-page\s*{[\s\S]*?min-height:\s*0[\s\S]*?align-self:\s*start[\s\S]*?background:\s*#ffffff[\s\S]*?box-shadow:\s*none/, "Admin payment methods page must shrink to its rows and use the light admin handbook panel.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-payment-page \.admin-income-title > span\s*{[\s\S]*?background:\s*#048453/, "Admin payment methods title accent must use the green admin palette.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-payment-page \.admin-income-add\s*{[\s\S]*?background:\s*#048453/, "Admin payment methods add button must use the green admin palette without changing shape.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-payment-table__row\s*{[\s\S]*?grid-template-columns:\s*76px minmax\(260px,\s*1fr\) minmax\(180px,\s*0\.42fr\) 124px 78px[\s\S]*?border:\s*1px solid #dfe7e3[\s\S]*?background:\s*#f6f7f7/, "Admin payment methods rows must keep the same layout with the reference light green-gray surface.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-payment-table__head\s*{[\s\S]*?color:\s*#f8fafc[\s\S]*?background:\s*#048453/, "Admin payment methods table header must render in the reference green palette.");
assert.match(css, /Payment methods: admin handbook table template\.[\s\S]*?\.admin-payment-page \.admin-payment-table__row \.admin-income-status\s*{[\s\S]*?background:\s*#f5ffec/, "Admin payment methods status pill must use the light green admin style.");
assert.match(adminFinanceHistoryPage, /const historyFallbackRows = useMemo/, "Admin finance history must render existing local rows when the API is empty or unavailable.");
assert.match(adminFinanceHistoryPage, /setRows\(historyFallbackRows\)/, "Admin finance history must keep local fallback rows in sync.");
assert.match(adminFinanceHistoryPage, /adminApi\.get\("\/finance\/finance-history"/, "Admin finance history must use the existing finance history endpoint.");
assert.match(adminFinanceHistoryPage, /const historyScrollRef = useRef/, "Admin finance history must manage a dedicated visible horizontal scrollbar.");
assert.match(adminFinanceHistoryPage, /className="admin-history-table-wrap"[\s\S]*?ref={historyScrollRef}[\s\S]*?onScroll={updateHistoryScroll}[\s\S]*?onWheelCapture={keepWheelInsideScroller}/, "Admin finance history must keep wheel and scrollbar state synced inside the table scroller.");
assert.match(adminFinanceHistoryPage, /className="admin-history-scrollbar"[\s\S]*?admin-history-scrollbar__button is-prev[\s\S]*?admin-history-scrollbar__track[\s\S]*?admin-history-scrollbar__thumb[\s\S]*?admin-history-scrollbar__button is-next/, "Admin finance history must render the visible reference-style scrollbar under the table.");
assert.match(css, /\.admin-content:has\(\.admin-history-page\)\s*{[\s\S]*?padding:\s*10px\s*!important;[\s\S]*?background:\s*#f4f5f5/, "Admin finance history content area must show the same 10px background frame as payment methods.");
assert.match(css, /\.admin-content \.admin-history-page\s*{[\s\S]*?min-height:\s*0[\s\S]*?align-self:\s*start[\s\S]*?background:\s*#ffffff/, "Admin finance history panel must shrink to its rows in the payment methods template.");
assert.match(css, /\.admin-history-page \.admin-income-title > span\s*{[\s\S]*?background:\s*#048453/, "Admin finance history title accent must use the green admin palette.");
assert.match(css, /\.admin-history-table th\s*{[\s\S]*?color:\s*#f8fafc[\s\S]*?background:\s*#048453/, "Admin finance history table header must use the green payment methods palette.");
assert.match(css, /\.admin-history-table td\s*{[\s\S]*?border-top:\s*1px solid #dfe7e3[\s\S]*?background:\s*#f6f7f7/, "Admin finance history rows must use the same light green-gray payment methods surface.");
assert.match(css, /\.admin-history-table th:nth-child\(10\)\s*{\s*width:\s*330px;\s*}/, "Admin finance history comment column must stay wide like the reference.");
assert.match(css, /\.admin-history-table\s*{[\s\S]*?min-width:\s*1560px/, "Admin finance history table must overflow horizontally so the bottom scrollbar is useful.");
assert.doesNotMatch(css, /\.admin-history-comment\s*{[^}]*text-overflow:\s*ellipsis/, "Admin finance history comments must not show ellipsis after horizontal scrolling.");
assert.match(css, /\.admin-history-comment\s*{[\s\S]*?white-space:\s*normal[\s\S]*?overflow-wrap:\s*anywhere/, "Admin finance history comments must wrap instead of cutting text with dots.");
assert.match(css, /\.admin-history-table-wrap\s*{[\s\S]*?scrollbar-width:\s*none[\s\S]*?-ms-overflow-style:\s*none/, "Admin finance history must hide the browser scrollbar and use the visible custom one.");
assert.match(css, /\.admin-history-scrollbar\s*{[\s\S]*?grid-template-columns:\s*18px minmax\(0,\s*1fr\) 18px/, "Admin finance history custom scrollbar must include side arrow slots and a full track.");
assert.match(css, /\.admin-history-scrollbar__track\s*{[\s\S]*?height:\s*9px[\s\S]*?background:\s*#f3f4f4/, "Admin finance history custom scrollbar must render the light gray reference track.");
assert.match(css, /\.admin-history-scrollbar__thumb\s*{[\s\S]*?min-width:\s*44px[\s\S]*?background:\s*#8f9391/, "Admin finance history custom scrollbar must render the dark gray draggable thumb.");
assert.match(css, /\.admin-history-pager button\.is-active\s*{[\s\S]*?background:\s*#048453[\s\S]*?border-color:\s*#048453/, "Admin finance history pager active page must match the green admin palette.");
assert.match(css, /\.admin-finance-table th\s*{[\s\S]*?color:\s*#f8fafc[\s\S]*?background:\s*#048453/, "Admin finance table header must use a unified sidebar green color.");
assert.match(css, /\.admin-finance-table-shell\s*{[\s\S]*?flex:\s*0 0 auto[\s\S]*?overflow:\s*auto[\s\S]*?border:\s*1px solid #dfe6ef[\s\S]*?border-radius:\s*6px[\s\S]*?scrollbar-color:\s*rgba\(214,\s*168,\s*79,\s*0\.28\) rgba\(255,\s*255,\s*255,\s*0\.04\)/, "Admin finance table scrollbar must reuse the dashboard table wrapper style.");
assert.match(adminFinanceSection, /<colgroup>[\s\S]*?admin-finance-col-comment[\s\S]*?admin-finance-col-actions[\s\S]*?<\/colgroup>/, "Admin finance table must define stable columns for resize and zoom.");
assert.match(css, /\.admin-finance-table-shell\s*{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%/, "Admin finance table wrapper must not clip columns outside the page width.");
assert.match(css, /\.admin-finance-table\s*{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*980px[\s\S]*?table-layout:\s*fixed/, "Admin finance table must fit normal desktop widths and scroll only on narrow screens.");
assert.match(css, /\.admin-finance-col-comment\s*{\s*width:\s*23%;\s*}/, "Admin finance comments column must stay visible and responsive.");
assert.match(css, /\.admin-finance-col-actions\s*{\s*width:\s*4%;\s*}/, "Admin finance delete action column must stay narrow across resize and zoom.");
assert.doesNotMatch(css, /\.admin-finance-table td:last-child\s*{[^}]*position:\s*sticky/, "Admin finance delete column must not use sticky positioning because it causes resize artifacts.");
assert.match(adminFinanceSection, /<td className="admin-finance-comment"><span>{row\.comment}<\/span><\/td>/, "Admin finance comments must render inside a wrapper for multiline clamping.");
assert.match(css, /\.admin-finance-comment > span\s*{[\s\S]*?-webkit-line-clamp:\s*3[\s\S]*?overflow-wrap:\s*anywhere/, "Admin finance comments must wrap into up to three lines.");
assert.match(css, /\.admin-finance-table td\s*{[\s\S]*?background:\s*#f6f7f7[\s\S]*?border-top:\s*1px solid #dfe7e3[\s\S]*?border-bottom:\s*1px solid #dfe7e3/, "Admin finance rows must use a light gray background with subtle borders.");
assert.match(css, /\.admin-finance-filter-drawer\s*{[\s\S]*?position:\s*fixed[\s\S]*?justify-content:\s*flex-end/, "Admin finance filter drawer must open as a right-side overlay.");
assert.match(css, /\.admin-finance-filter-panel\s*{[\s\S]*?border-radius:\s*22px 0 0 22px[\s\S]*?background:\s*#fbfdfc/, "Admin finance filter drawer must use the admin panel template.");
assert.match(css, /\.admin-finance-filter-field select:has\(option\[value="all"\]:checked\)\s*{[\s\S]*?rgba\(51,\s*65,\s*85,\s*0\.42\)/, "Admin finance filter placeholder values must render transparently.");
assert.match(css, /\.admin-finance-action\.is-filter\s*{[\s\S]*?color:\s*#0f172a/, "Admin finance toolbar filter button text must be black.");
assert.match(css, /\.admin-finance-filter-actions \.is-apply\s*{[\s\S]*?linear-gradient\(90deg,\s*#027046 0%,\s*#015f3f 74%,\s*#014c32 100%\)/, "Admin finance filter apply button must use the sidebar green gradient.");

console.log("admin login tests passed");
