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

assert.match(css, /\.admin-login__panel\s*{[\s\S]*?width:\s*min\(450px,\s*calc\(100vw - 32px\)\)/, "Login panel must use the compact 450px width.");
assert.match(css, /\.admin-login__input\s*{[\s\S]*?min-height:\s*48px/, "Login inputs must use compact height.");
assert.match(css, /\.admin-login__submit\s*{[\s\S]*?min-height:\s*50px/, "Login submit button must use compact height.");
assert.match(css, /\.admin-login__panel \.admin-login__eye\s*{[\s\S]*?background:\s*transparent/, "Eye button must stay transparent.");
assert.match(css, /\.admin-login__field--password \.admin-login__input\s*{[\s\S]*?column-gap:\s*14px/, "Password input must have spacing after the lock icon.");
assert.match(css, /\.admin-login__input input\s*{[\s\S]*?color:\s*#fff8e6/, "Login input values must be fully readable.");
assert.match(css, /\.admin-login__input input::placeholder\s*{[\s\S]*?opacity:\s*1/, "Login placeholders must not look transparent.");
assert.match(app, /const datePresets = \[/, "Admin date picker must define quick date presets.");
assert.match(app, /Сегодня[\s\S]*Вчера[\s\S]*Этот месяц[\s\S]*Прошлый год/, "Admin date picker must include the expected quick presets.");
assert.match(app, /className="admin-date-picker"/, "Admin header must render the date picker wrapper.");
assert.match(app, /className="admin-date-menu"/, "Admin date picker must render a dropdown menu.");
assert.match(app, /aria-label="Предыдущий месяц"/, "Admin date picker must support previous-month navigation.");
assert.match(app, /aria-label="Следующий месяц"/, "Admin date picker must support next-month navigation.");
assert.match(app, /Дата начала/, "Admin date picker must include a start date input.");
assert.match(app, /Дата окончания/, "Admin date picker must include an end date input.");
assert.match(css, /\.admin-date-menu\s*{[\s\S]*?position:\s*absolute/, "Admin date menu must be positioned as a dropdown.");
assert.match(css, /\.admin-date-range\s*{[\s\S]*?grid-template-columns:/, "Admin date range controls must be laid out cleanly.");

const restaurantPasswordInput = restaurantLogin.slice(
  restaurantLogin.indexOf('type={showPassword ? "text" : "password"}'),
  restaurantLogin.indexOf('className="login-pro-eye"')
);

assert.match(restaurantPasswordInput, /placeholder="Введите пароль"/, "Restaurant login password must show a readable password placeholder.");
assert.doesNotMatch(restaurantPasswordInput, /[•вЂў]{3,}/, "Restaurant login password must not show background dot text.");
assert.match(restaurantLogin, /Добро пожаловать/, "Restaurant login title must be readable Russian text.");
assert.match(restaurantLogin, /Войдите в рабочее место вашего ресторана\./, "Restaurant login subtitle must be readable Russian text.");
assert.match(restaurantLogin, /Запомнить меня/, "Restaurant login remember label must be readable Russian text.");
assert.match(restaurantLogin, /Забыли пароль\?/, "Restaurant login forgot label must be readable Russian text.");
assert.doesNotMatch(restaurantLogin, /Р[ќџћ”’•—]/, "Restaurant login must not contain mojibake Russian text.");
assert.match(reportDateRangePicker, /className="report-period-picker"/, "Shared report period button must open a date picker wrapper.");
assert.match(reportDateRangePicker, /className="report-date-menu"/, "Shared report date picker must render a dropdown menu.");
assert.match(reportDateRangePicker, /Сегодня[\s\S]*Вчера[\s\S]*Этот месяц[\s\S]*Прошлый год/, "Shared report date picker must include quick presets.");
assert.match(reportDateRangePicker, /report-date-input/, "Shared report date picker must render clickable lower date fields.");
assert.match(reportDateRangePicker, /calendarTarget === "start" \? "is-active"/, "Shared report date picker must highlight the active lower start date field.");
assert.match(reportDateRangePicker, /className="report-date-ok"/, "Shared report date picker must keep OK as a separate action button.");
assert.match(reportDateRangePicker, /function MiniCalendar/, "Shared report date picker must open an internal calendar for lower date fields.");
assert.match(reportDateRangePicker, /report-mini-calendar__toolbar/, "Shared report calendar must include month and year controls.");
assert.match(reportDateRangePicker, /report-mini-calendar__today/, "Shared report calendar must include a Today action.");
assert.match(reportDateRangePicker, /const timeSlots = /, "Shared report calendar must define time slots.");
assert.match(reportDateRangePicker, /16 \* 60 \+ 28/, "Shared report calendar time list must start like the requested reference.");
assert.match(reportDateRangePicker, /report-mini-time__list/, "Shared report calendar must render the time picker list.");
assert.match(reportDateRangePicker, /selectTime/, "Shared report calendar must allow selecting a time.");
assert.match(reportDateRangePicker, /applyDraft/, "Shared report date picker must apply the selected range.");
assert.match(tablesReport, /<ReportDateRangePicker value={dateRange} onChange={setDateRange} \/>/, "Tables report must use the shared date picker.");
assert.match(ordersReport, /<ReportDateRangePicker value={dateRange} onChange={setDateRange} \/>/, "Orders report must use the shared date picker.");
assert.match(dishesReport, /<ReportDateRangePicker value={dateRange} onChange={setDateRange} \/>/, "Dishes report must use the shared date picker.");
assert.match(appCss, /\.report-actions \.report-date-menu\s*{[\s\S]*?position:\s*absolute/, "Shared report date menu must be a dropdown.");
assert.match(appCss, /\.report-actions \.report-date-range\s*{[\s\S]*?grid-template-columns:/, "Shared report date range fields must be laid out.");
assert.match(appCss, /\.report-actions \.report-date-range\s*{[\s\S]*?position:\s*sticky/, "Shared report lower date controls must remain visible.");
assert.match(appCss, /\.report-actions \.report-mini-calendar\s*{[\s\S]*?position:\s*absolute/, "Shared report mini calendar must open under the lower date field.");
assert.match(appCss, /\.report-actions \.report-mini-time\s*{[\s\S]*?grid-column:\s*2/, "Shared report time picker must sit beside the mini calendar.");
assert.match(appCss, /\.report-actions \.report-date-input,\s*\.report-actions \.report-date-input\.is-active\s*{[\s\S]*?background:\s*#fff/, "Shared report lower date fields must stay white like the requested reference.");

console.log("admin login tests passed");
