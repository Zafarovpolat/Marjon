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

assert.match(app, /const adminFinanceApi = {[\s\S]*?createTransaction\(payload, idempotencyKey\)[\s\S]*?adminApi\.post\("\/finance\/transactions", payload/, "Admin finance must create transactions through the existing finance endpoint.");
assert.match(app, /headers:\s*{ "Idempotency-Key": idempotencyKey }/, "Admin finance submit must send an idempotency key to protect repeated requests.");
assert.match(adminFinanceSection, /if \(financeSubmitting\) return;/, "Admin finance submit must block repeated clicks while a request is in flight.");
assert.match(adminFinanceSection, /direction:\s*financeDraft\.operationType/, "Admin finance payload must send backend direction income or expense.");
assert.match(adminFinanceSection, /onNotify\?\.\(financeDraft\.operationType === "income" \? "Приход успешно добавлен"/, "Admin finance must notify after successful income creation.");
assert.match(adminFinanceSection, /catch \(error\)[\s\S]*?setFinanceSubmitError\(message\)/, "Admin finance must keep form data and show backend errors.");
assert.match(app, /function validateAdminFinanceDraft\(draft\)[\s\S]*?Введите сумму[\s\S]*?Сумма должна быть больше нуля[\s\S]*?Выберите способ оплаты[\s\S]*?Выберите филиал[\s\S]*?Выберите дату[\s\S]*?Выберите категорию/, "Admin finance validation must cover amount, payment, branch, date and category.");
assert.match(adminFinanceModal, /Добавление…/, "Admin finance submit button must show the required loading text.");
assert.match(adminFinanceModal, /maxLength={ADMIN_FINANCE_COMMENT_LIMIT}/, "Admin finance comment field must have a hard character limit.");
assert.match(app, /ADMIN_FINANCE_COUNTERPARTY_TYPES\.map/, "Admin finance modal must render counterparty type selector options.");
assert.match(css, /\.admin-finance-operation-dialog\s*{[\s\S]*?width:\s*min\(500px,\s*calc\(100vw - 32px\)\)/, "Admin finance modal must use the requested compact desktop width.");
assert.match(css, /\.admin-finance-operation-dialog \.admin-transaction-field\.is-invalid[\s\S]*?rgba\(220,\s*38,\s*38/, "Admin finance invalid fields must render with a red border.");
assert.match(css, /\.admin-finance-select-menu\s*{[\s\S]*?position:\s*absolute/, "Admin finance searchable select must render as a dropdown.");

console.log("admin login tests passed");
