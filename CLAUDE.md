# MARJON — Контекст проекта для AI-агентов

> Этот файл читается автоматически при каждой сессии.
> Прочитай ПОЛНОСТЬЮ перед любой работой с кодом.
> Последнее обновление: 2026-07-08

---

## 1. Что такое Marjon

SaaS-платформа для автоматизации ресторанов на рынке Узбекистана.
POS-касса, кухонный дисплей (KDS), склад, доставка, CRM, HR, аналитика, фискализация (ОФД), интеграция Click/Payme/Uzum.

**Дедлайн MVP:** 10.08.2026
**Ветка разработки:** `front` (push только сюда)
**Репозиторий:** `github.com/examerxx/Marjon`

---

## 2. Границы ответственности

> **Прочитай перед любой работой.**

| Правило | Значение |
|---------|----------|
| Backend + Frontend | Обе части проекта доступны для работы |
| Не пушь без просьбы | `git push` только когда пользователь явно просит |
| Не создавай лишнего | Не добавляй фичи, абстракции и файлы сверх задания |
| Mobile / Desktop | Не трогай (планируются v1.1–v1.2) |

---

## 3. Стек и зависимости

### Frontend (твоя зона)

| Что | Технология | Заметки |
|-----|-----------|---------|
| UI | React 18, JSX | **Не TypeScript!** Весь код `.jsx` |
| Сборка | Vite 5 | Multi-page: `index.html` (кафе POS) + `admin.html` (админка) |
| Роутинг | React Router v6 | `<Routes>` в `App.jsx` |
| HTTP | Axios | Единый клиент в `src/api/client.js` |
| Графики | Chart.js 4 | Используется в дашборде и отчётах |
| Иконки | Lucide React + Bootstrap Icons SVG | `<Icon>` компонент-обёртка |
| CSS | Vanilla CSS | **Без Tailwind.** 15 файлов, ~45K строк |
| Токены | `marjon-tokens.css` | Все цвета, тени, радиусы — ТОЛЬКО через токены |
| State | React Context | `AuthContext`, `OrgContext`, `ThemeContext` |

### Backend

FastAPI + Python 3.12 + SQLAlchemy 2.0 async + Alembic + PostgreSQL (Supabase).
30 модулей в `backend/app/modules/`. Swagger: `localhost:8000/docs`.

Бэкенд можно менять. Сейчас активная работа над мобилкой и десктопом — бэкенд чиним потом.

**TODO (бэкенд, отложено):** `/auth/pin-login` (`backend/app/modules/auth/router.py`) — заглушка, всегда кидает "PIN-логин не настроен". Нужно реализовать: поиск user по `pin_code` в рамках company, выдача access/refresh токенов (по образцу `AuthService.login`). Фронт (десктоп) уже вызывает `auth.loginByPin`.

### Backend паттерны

**Структура модуля:**
```
backend/app/modules/{module}/
├── models.py      # SQLAlchemy модели (TimeStampedModel base)
├── schemas.py     # Pydantic v2 (BaseSchema, BaseResponseSchema)
├── repository.py  # CRUD операции с БД
├── service.py     # Бизнес-логика
└── router.py      # FastAPI endpoints
```

**Три prefix-группы (main.py):**
- `/api/v1` — legacy (все роутеры)
- `/api/v1/kafe` — кафе-панель (POS, кухня, склад, аналитика, финансы)
- `/api/v1/admin` — HQ-админка (организации, маркетинг, справочники)

**Базовая модель:**
```python
from app.shared.base_model import TimeStampedModel
class MyModel(TimeStampedModel):
    __tablename__ = "my_table"
    company_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("companies.id"), index=True)
```

**Авторизация:**
```python
from app.modules.auth.dependencies import get_current_user
@router.get("/")
async def endpoint(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # user.company_id — для tenant isolation
```

**Конфигурация:** `app/config.py` → `pydantic_settings`, читает `.env`.
**Миграции:** `alembic revision --autogenerate -m "message"`, затем `alembic upgrade head`.

---

## 4. Структура фронтенда

```
frontend/src/
├── api/
│   ├── client.js        # Axios instance, JWT interceptors, formatMoney()
│   ├── receipt.js       # API для чеков
│   └── ws.js            # WebSocket клиент
├── admin/               # Отдельное приложение (admin.html)
│   ├── AdminApp.jsx
│   ├── api.js           # Axios для админки (отдельный)
│   ├── main.jsx
│   └── styles.css       # ~8400 строк
├── components/          # 12 переиспользуемых компонентов
│   ├── DashboardLayout.jsx   # Shell: sidebar + topbar + content
│   ├── Sidebar.jsx           # Навигация + mobile bottom-nav
│   ├── Topbar.jsx            # Дата, курс, баланс, уведомления
│   ├── DemoNotice.jsx        # Баннер «Демо-данные»
│   ├── DataTableView.jsx     # Универсальная таблица
│   ├── SettingsResourcePage  # → в pages/settings/ (CRUD-компонент)
│   ├── GlobalSearch.jsx      # Ctrl+K поиск
│   ├── DatePicker.jsx
│   ├── ReportDateRangePicker.jsx
│   ├── Loader.jsx
│   ├── BackButton.jsx
│   ├── Icon.jsx
│   ├── SupportWidget.jsx
│   └── receipt/              # Компоненты чеков
├── context/
│   ├── AuthContext.jsx       # JWT, login/logout, user
│   ├── OrgContext.jsx        # Данные организации (name, currency, vat)
│   └── ThemeContext.jsx      # Тема (пока не используется)
├── pages/                    # 29 страниц + подпапки
│   ├── auth/                 # PinLoginPage, StaffLoginPage
│   ├── settings/             # 11 settings-страниц + SettingsResourcePage
│   ├── OwnerDashboard.jsx    # Главный дашборд (~1025 строк)
│   ├── OrdersPage.jsx        # POS-заказы
│   ├── KitchenPage.jsx       # Кухонный экран
│   ├── WaiterPage.jsx        # Экран официанта
│   ├── MenuPage.jsx          # Управление меню
│   ├── NomenclaturePage.jsx  # Блюда + ингредиенты (2 режима)
│   ├── WarehousePage.jsx     # Склад (8 разделов)
│   ├── FinancePage.jsx       # Финансы
│   ├── StaffPage.jsx         # Персонал
│   ├── *ReportPage.jsx       # 7 типов отчётов
│   └── ...
├── styles/                   # 15 CSS-файлов, ~45K строк суммарно
│   ├── react-overrides.css   # ~29300 строк (основной!)
│   ├── app.css               # ~6900 строк
│   ├── dashboard.css         # ~5900 строк
│   ├── marjon-tokens.css     # 273 строки (токены — источник истины)
│   ├── topbar-widgets.css    # ~540 строк
│   ├── receipt.css           # ~960 строк
│   ├── staff-pos.css         # ~580 строк
│   └── ... (8 файлов поменьше)
└── utils/
    ├── date.js               # Хелперы дат
    └── permissions.js        # Проверка прав
```

---

## 5. Ключевые паттерны кода

### 5.1. Demo Fallback (обязателен для КАЖДОЙ страницы)

Фронтенд работает ВСЕГДА — даже без бэкенда. Каждая страница:

```jsx
const [rows, setRows] = useState(HARDCODED_DATA);
const [isDemo, setIsDemo] = useState(true);

useEffect(() => {
  api.get("/endpoint")
    .then(({ data }) => {
      const items = Array.isArray(data) ? data : data?.items || [];
      if (items.length) {
        setRows(items.map(mapApiRow));
        setIsDemo(false);
      }
    })
    .catch(() => {});
}, []);

return (
  <>
    {isDemo && <DemoNotice />}
    {/* контент */}
  </>
);
```

**Правила:**
- `HARDCODED_DATA` — реалистичные данные для демо (не `[]`)
- `isDemo` по умолчанию `true` — переключается на `false` только при успешном API-ответе с данными
- `DemoNotice` — жёлтый баннер «Показаны демо-данные»
- `.catch(() => {})` — ошибки API НЕ ломают UI, молча остаёмся на демо

### 5.2. API Client

```js
// src/api/client.js
import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1",
});
// JWT автоматически в headers через interceptor
// Refresh token при 401 — автоматически
```

### 5.3. Vite Multi-Page

Два entry point:
- `index.html` → кафе (POS-интерфейс)
- `admin.html` → админка (отдельное React-приложение в `src/admin/`)

```js
// vite.config.js
build: {
  rollupOptions: {
    input: { kafe: "index.html", admin: "admin.html" }
  }
}
```

### 5.4. Запуск

```bash
cd frontend && npm install && npm run dev   # → http://localhost:5173
# Vite проксирует /api → http://127.0.0.1:8000
```

---

## 6. CSS-архитектура

> ⚠️ Перед любой реструктуризацией/разбиением HQ CSS (`src/admin/styles.css`) прочти
> `docs/adr/fe-08c-hq-css-monolith-v1.md` — для Web V1 это намеренный монолит,
> ретро-split запрещён. (Таблица ниже исторически устарела; актуальные размеры — в репозитории.)

### 6.1. Файлы и их роли

| Файл | Строк | Роль |
|------|-------|------|
| `react-overrides.css` | ~29300 | Основной: все компоненты, страницы, breakpoints |
| `app.css` | ~6900 | Базовые стили приложения |
| `dashboard.css` | ~5900 | Layout дашборда, sidebar, topbar |
| `marjon-tokens.css` | 273 | Дизайн-токены (ИСТОЧНИК ИСТИНЫ для цветов!) |
| `topbar-widgets.css` | ~540 | Виджеты топбара |
| Остальные 10 файлов | ~2400 | auth, receipt, staff-pos, responsive и др. |

### 6.2. Layout (критические зависимости)

```
dashboard-shell (display: flex, flex-direction: row)
├── dashboard-sidebar (width: 260px, position: relative)
│   └── ≤1024px: width: 0, скрыт → вместо него mobile-bottom-nav
└── dashboard-main (flex: 1 1 auto)
    ├── dashboard-topbar (flex-shrink: 0)
    └── dashboard-content (flex: 1 1 auto, overflow-y: auto)
```

**Цепочки зависимостей:**
- Ширина sidebar → ширина `dashboard-main` → ширина топбара и контента → ВСЕ внутренние элементы
- Высота топбара → `min-height: calc(100vh - Xpx)` у `dashboard-content`
- `mobile-bottom-nav` — **сиблинг** `<aside>`, НЕ внутри него (из-за `transform` на aside)

### 6.3. Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| > 1440px | Полный десктоп, топбар 86px |
| 1025–1440px | Компактный топбар 64px |
| ≤ 1024px | Sidebar скрыт, bottom nav, топбар 54px |
| ≤ 768px | Мобильный вид |

### 6.4. Дизайн-токены (палитра)

**Источник истины: `marjon-tokens.css`**

| Токен | HEX | Когда использовать |
|-------|-----|-------------------|
| `--color-brand` / `--teal-500` | `#1db5b5` | CTA-кнопки, активные элементы, акценты |
| `--color-brand-hover` / `--teal-400` | `#22d3ee` | Hover-состояние |
| `--color-brand-dark` / `--teal-600` | `#0fa3a3` | Active/pressed |
| `--neutral-950` | `#071428` | Самый тёмный фон (sidebar, bottom nav) |
| `--neutral-900` | `#0b1f3f` | Тёмные панели, drawer |
| `--neutral-800` | `#162840` | Вторичные тёмные поверхности |
| `--neutral-50` / `--color-bg` | `#f4f7fc` | Фон страницы |
| `--neutral-0` / `--color-card` | `#ffffff` | Фон карточек |
| `--color-interactive` | `#2563eb` | **ТОЛЬКО ссылки** (не кнопки, не фоны) |

### 6.5. Запреты по CSS

| Нельзя | Почему |
|--------|--------|
| Hex-коды напрямую | Всегда через токены из `marjon-tokens.css` |
| `--color-interactive` как фон | Это цвет ссылок, не фон |
| Teal-градиенты на тёмных панелях | Визуальный конфликт с палитрой |
| Менять ширину sidebar без анализа | Ломает всю flex-цепочку layout |
| Менять высоту topbar без пересчёта | Нужно обновить `calc(100vh - X)` во всех местах |
| `!important` без крайней необходимости | Создаёт долг по specificity |

---

## 7. Чеклист перед правкой CSS

> **ОБЯЗАТЕЛЬНО перед любой CSS-правкой:**

```
[ ] Прочитал текущее состояние файла (Read)
[ ] Grep: нашёл ВСЕ правила для этого селектора во ВСЕХ CSS-файлах
[ ] Проверил specificity — не создам ли конфликт
[ ] Понял цепочку зависимостей (родитель → элемент → дети)
[ ] Знаю на каких breakpoints это правило применяется
[ ] Не использую hex-коды — только токены
```

**После правки:**
```
[ ] Проверил на 390px (мобильный)
[ ] Проверил на 768px (планшет)
[ ] Проверил на 1280px+ (десктоп)
[ ] Ничего не сломалось за пределами изменённого элемента
```

---

## 8. Частые ошибки (не повторяй)

| Ошибка | Причина | Как избежать |
|--------|---------|-------------|
| `position: fixed` внутри sidebar на мобильном | Sidebar имеет `transform` → fixed позиционируется от sidebar, не viewport | Выносить fixed-элементы за `<aside>` |
| CSS override не применяется | Низкая specificity | Grep все правила, проверить computed styles |
| Элемент схлопывается | `flex-shrink: 1` по умолчанию | Добавить `flex-shrink: 0` |
| Цвет «синий» вместо teal | Перепутан `--neutral-950` с `--color-brand` | Сверяться с таблицей токенов |
| Бордер не виден | Цвет бордера совпадает с фоном | Проверить контраст |
| react-overrides перебивает dashboard.css | Порядок import в app | Писать в том файле, где уже есть правило |
| Забыл обновить `calc(100vh - X)` | Поменял высоту topbar | Grep все `calc(100vh` |

---

## 9. Документация проекта

| Документ | Путь | Что внутри |
|---------|------|-----------|
| Общее ТЗ | `docs/tz/TZ_GENERAL.md` | Рынок, конкуренты, архитектура, безопасность, платежи, тестирование, оптимизация |
| Web ТЗ | `docs/tz/TZ_WEB.md` | Все страницы web-панели, API-маршруты, demo fallback |
| Mobile ТЗ | `docs/tz/TZ_MOBILE.md` | React Native + Expo, роли, экраны |
| Desktop ТЗ | `docs/tz/TZ_DESKTOP.md` | Electron KDS для поваров |
| Дополнение | `docs/tz/TZ_ADDENDUM.md` | User stories, offline-сценарии, боли рынка |
| Техдока | `docs/DOCUMENTATION.md` | Архитектура, модели, API endpoints |
| Стайлгайд | `docs/STYLEGUIDE.md` | Дизайн-система, палитра, компоненты |

---

## 10. Бизнес-контекст (для лучших решений)

- **Рынок:** Узбекистан, 29 млн потребителей, обязательная фискализация
- **Конкуренты:** iiko (50K+), Paloma365 (10K+), AliPOS (1290+), ZimZim (500+)
- **Наш фокус:** простота + цена + offline для малых кафе (5–20 столов)
- **Платежи:** Click, Payme, Uzum Bank, наличные, смешанная
- **Фискализация:** ОФД УЗ (ЦОТУ / soliq.uz) — обязательна по закону
- **Валюта:** UZS (основная), USD (для отчётов). Форматирование: `formatMoney()` из `api/client.js`
- **Языки:** русский (основной), узбекский (v1.1)
- **Роли:** Владелец, Менеджер, Кассир, Официант, Повар, Курьер, Бухгалтер

---

## 11. Статус платформ

| Платформа | Статус | Где код |
|-----------|--------|---------|
| Web Admin Panel | 🟢 ~80% MVP | `frontend/` |
| Mobile App (React Native) | 🔴 Не начато | Планируется v1.2 |
| Desktop KDS (Electron) | 🔴 Не начато | Планируется v1.1 |
| Print Agent | 🟡 Backend готов | `backend/print_agent/` |
| Админка (HQ) | 🟡 Частично | `frontend/src/admin/` |

---

## 12. Git-конвенции

- **Ветка:** `front` (вся frontend-разработка тут)
- **Коммиты:** на русском или английском, осмысленные
- **Формат:** `feat:`, `fix:`, `docs:`, `refactor:`, `style:` (conventional commits)
- **Не коммить:** `node_modules/`, `.env`, `*.log`, `dist/`, `.venv/`
- **Перед коммитом:** `npm run build` — проверить что сборка проходит
