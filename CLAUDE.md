# MARJON — Правила для AI-агентов

> Этот файл читается автоматически при каждой сессии. Соблюдать ОБЯЗАТЕЛЬНО.

---

## 1. Перед любой правкой CSS — обязательный анализ

> ⚠️ **СНАЧАЛА АНАЛИЗ, ПОТОМ КОД.** Перед тем как писать CSS — ответь на все вопросы ниже. Если не можешь ответить — сначала grep/read, потом пиши.

**Вопросы которые надо задать себе ДО правки:**
- Что именно я меняю и зачем?
- Какие другие элементы геометрически зависят от этого свойства? (высота → min-height дочерних, ширина → flex siblings)
- Есть ли у изменяемого элемента `min-width`/`min-height` в базовых правилах, которые перебьют мой override?
- На каких breakpoints действует это правило — не сломает ли другие?
- Если меняю размер контейнера — пересчитал ли все `calc(100vh - X)` внутри?

```
[ ] Прочитал текущее состояние файла (Read tool)
[ ] Нашёл ВСЕ существующие правила для этого селектора (Grep tool)
[ ] Проверил specificity — не создам ли конфликт с !important
[ ] Понял, какие дочерние/родительские элементы зависят от этого свойства
[ ] Знаю на каких breakpoints это правило применяется
```

После правки:
```
[ ] Скриншот на 390px (iPhone)
[ ] Скриншот на 768px (iPad)
[ ] Скриншот на 1280px (ноутбук)
[ ] Проверил computed styles через browser_evaluate (не верю только визуалу)
[ ] Ничего не сломалось за пределами изменённого элемента
```

---

## 2. CSS-архитектура — что на что влияет

### Основной layout (dashboard)

```
dashboard-shell (display: flex, flex-direction: row)
├── dashboard-sidebar (width: 260px, position: relative, z-index: 3)
│   └── НА ≤1024px: width: 0, скрыт; вместо него mobile-bottom-nav (position: fixed)
└── dashboard-main (flex: 1 1 auto, overflow: hidden auto)
    ├── dashboard-topbar (flex-shrink: 0)
    └── dashboard-content (flex: 1 1 auto, overflow-y: auto)
```

**⚠️ Критические зависимости:**
- Изменение `width` сайдбара → меняет ширину `dashboard-main` → меняет ширину топбара и контента → затрагивает все внутренние элементы
- Изменение `height` топбара → **обязательно** пересчитать:
  - `dashboard-content { min-height: calc(100vh - <новая_высота>px) }` — иначе пустое место снизу
  - `padding-bottom` у `dashboard-content` на ≤1024px
  - `top` у `dashboard-back-slot` если он `position: fixed`
- `flex-shrink: 0` на топбаре — НЕЛЬЗЯ убирать, иначе он схлопнется
- `position: fixed` внутри элемента с `transform` → позиционируется не от viewport, а от трансформированного родителя

### Сайдбар на ≤1024px

Фреймворк применяет к `aside.dashboard-sidebar`:
- `position: fixed`
- `transform: translateX(-Xpx)` (сдвигает за экран)

Это значит: **любой `position: fixed` дочерний элемент внутри aside позиционируется относительно aside, а не viewport**. Поэтому `mobile-bottom-nav` вынесен ВНЕ `<aside>` (он сиблинг, не дочерний элемент).

### Breakpoints

| Breakpoint | Что происходит |
|-----------|----------------|
| > 1440px  | Полный десктоп, топбар 86px |
| 1025–1440px | Компактный топбар 64px, кнопки 36px, `min-height: calc(100vh - 64px)` |
| ≤ 1024px  | Сайдбар скрыт, bottom nav активен, топбар 54px |
| ≤ 768px   | Мобильный вид |

---

## 3. Дизайн-система — палитра и токены

**Файл токенов:** `frontend/src/styles/marjon-tokens.css`

### Основные цвета

| Токен | HEX | Применение |
|-------|-----|-----------|
| `--teal-500` / `--color-brand` | `#1db5b5` | CTA-кнопки, активные элементы, акценты |
| `--teal-400` / `--color-brand-hover` | `#22d3ee` | Hover-состояние |
| `--teal-600` / `--color-brand-dark` | `#0fa3a3` | Active/pressed |
| `--neutral-950` | `#071428` | Самый тёмный фон, сайдбар, bottom nav бар |
| `--neutral-900` | `#0b1f3f` | Тёмные панели, sidebar, drawer |
| `--neutral-800` | `#162840` | Вторичные тёмные поверхности |
| `--neutral-50` / `--color-bg` | `#f4f7fc` | Фон страницы, dashboard-content |
| `--neutral-0` / `--color-card` | `#ffffff` | Фон карточек |
| `--color-interactive` | `#2563eb` | ТОЛЬКО ссылки и мелкие UI-элементы |

### Запрещено

- ❌ `--color-interactive` (#2563eb) как фон панелей/карточек
- ❌ Teal-градиенты на тёмных боковых секциях
- ❌ Hex-коды напрямую — только токены из `marjon-tokens.css`
- ❌ Менять ширину `dashboard-sidebar` без анализа всей цепочки layout

### Тёмные панели

```css
/* ✅ Правильно */
background: var(--neutral-900);
background: linear-gradient(145deg, var(--neutral-800) 0%, var(--neutral-950) 100%);

/* ❌ Неправильно */
background: var(--color-interactive);
background: var(--color-brand);
```

### Акценты на тёмном фоне

```css
/* Teal-бейдж на тёмной панели */
background: rgba(29, 181, 181, 0.12);
border: 1px solid rgba(125, 232, 226, 0.18);
color: var(--teal-300);
```

---

## 4. Важные компоненты и их особенности

### Топбар (`dashboard-topbar`)

- На ≤1024px: `height: 54px`, `flex-shrink: 0`, `border-bottom-radius: 18px`
- Содержит: datepicker, rate-widget, notification badge, balance-pill
- Все дочерние элементы на ≤1024px — высота `34px`
- `topbar-notification__badge` — бордер `var(--color-brand)`, НЕ `--neutral-950`

### Сайдбар (`dashboard-sidebar`)

- Desktop: `width: 260px`, `position: relative`, `z-index: 3`
- Коллапс-состояние: класс `is-collapsed` на aside и `is-sidebar-collapsed` на shell
- Коллапс меняет ширину → меняет `dashboard-main`

### Mobile Bottom Nav (≤1024px)

- Рендерится как **сиблинг** `<aside>`, НЕ внутри него
- `position: fixed; bottom: 0; height: 54px; border-top-radius: 18px`
- 4 основных пункта + кнопка "Ещё" (drawer)
- Drawer: `position: fixed; bottom: 54px; z-index: 200`
- `dashboard-content` на ≤1024px имеет `padding-bottom: 62px` под бар

### Balance Pill (`topbar-balance-pill`)

- Содержит `topbar-balance-amount` и `topbar-pay-button`
- На ≤1024px оба элемента: `height: 34px`
- Specificity проблема: нужен `.dashboard-topbar .topbar-balance-pill .topbar-balance-amount`

---

## 5. Правила работы с этим проектом

### Перед правкой — обязательный анализ задания

> **СНАЧАЛА АНАЛИЗИРУЙ, ПОТОМ КОД.** Перед любым изменением пройди весь список ниже.

1. **Прочитай задание целиком** — что именно просят изменить
2. **Найди ВСЕ затронутые элементы** — не только целевой, но и соседей, детей, родителей
3. **Grep сначала** — найти все упоминания изменяемого класса во ВСЕХ CSS-файлах
4. **Проверить cascade** — какое правило сейчас выигрывает и почему
5. **Проверь min-width/min-height** — базовые правила могут перебить твой override
6. **Проверить побочные эффекты:** "Что ещё зависит от этого свойства?"
   - Изменяю высоту элемента → пересчитать `calc(100vh - X)` у дочерних
   - Изменяю размер кнопки → проверить `min-width`/`max-width` в базовых правилах
   - Добавляю breakpoint → убедиться что он не конфликтует с другими
7. **Не добавлять** цвет/фон без проверки по палитре выше

### При работе с CSS specificity

- Если что-то не применяется — скорее всего другое правило перебивает
- Проверять через `window.getComputedStyle()` в браузере, а не догадываться
- `!important` использовать осторожно — он создаёт долг specificity

### Запреты без явного разрешения пользователя

- ❌ Менять цвет топбара (background)
- ❌ Менять ширину сайдбара
- ❌ Добавлять `box-shadow` или `background` к топбару
- ❌ Пушить в git без явной просьбы

### Стек проекта

- **Frontend:** React 18, Vite, CSS (без Tailwind)
- **Backend:** FastAPI (Python), SQLite/PostgreSQL
- **Главный CSS файл:** `frontend/src/styles/react-overrides.css` (~22000 строк)
- **Запуск frontend:** `cd frontend && npm run dev` (порт 5173)
- **Запуск backend:** `cd backend && python -m uvicorn main:app --reload --port 8000`

---

## 6. Типичные ошибки — как избегать

| Ошибка | Причина | Как избежать |
|--------|---------|-------------|
| `position: fixed` не работает как ожидалось | Родитель имеет `transform` | Проверить `getComputedStyle(parent).transform` |
| Override не применяется | Низкая specificity или порядок в файле | Grep все правила, смотреть computed |
| Элемент схлопывается | `flex-shrink: 1` при нехватке места | Добавить `flex-shrink: 0` |
| Сайдбар ломает layout | Ширина влияет на flex sibling | Анализировать flex-цепочку |
| Цвет выглядит "синим" а не teal | Используется `--neutral-950` вместо `--color-brand` | Всегда проверять токен |
| Бордер не виден / слился с фоном | Цвет бордера = цвет фона | Проверить контраст с родительским bg |
