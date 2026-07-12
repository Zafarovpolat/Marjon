# Marjon

> Облачная SaaS-платформа для автоматизации ресторанов, кафе и фаст-фудов на рынке Узбекистана.

## О проекте

**Marjon** — комплексная система управления заведениями общепита. Покрывает полный цикл работы: POS-касса, кухонный дисплей (KDS), склад, доставка, CRM, лояльность, HR, аналитика, фискализация (ОФД), интеграция с Click / Payme / Uzum Bank, печать чеков.

**Целевой рынок:** Узбекистан — 29 млн потребителей общепита, рост отрасли +224% за 6 лет, обязательная фискализация (ЦОТУ).

**Дедлайн MVP:** 10.08.2026

## Стек

| Компонент | Технология |
|-----------|-----------|
| **Backend** | FastAPI, Python 3.12+, SQLAlchemy 2.0 (async), Alembic, PostgreSQL (Supabase) |
| **Frontend** | React 18, Vite, React Router v6, Axios, Chart.js, CSS (marjon-tokens.css) |
| **Mobile** | React Native + Expo (планируется v1.2) |
| **Desktop KDS** | Electron (планируется v1.1) |
| **Print Agent** | ESC/POS, polling-based, TCP |
| **Оплата** | Click, Payme, Uzum Bank, наличные, смешанная |
| **Фискализация** | ОФД Узбекистана (ЦОТУ / soliq.uz) |

## Структура проекта

```
Marjon/
├── docs/                        # Документация
│   ├── tz/                      # Техническое задание (5 документов)
│   │   ├── TZ_GENERAL.md        #   Общее ТЗ (v1.1, ~1500 строк)
│   │   ├── TZ_WEB.md            #   Web Admin Panel
│   │   ├── TZ_MOBILE.md         #   Mobile App (iOS / Android)
│   │   ├── TZ_DESKTOP.md        #   Desktop KDS (Electron)
│   │   └── TZ_ADDENDUM.md       #   Дополнение (боли, user stories, offline)
│   ├── DOCUMENTATION.md         # Полная техническая документация
│   ├── STYLEGUIDE.md            # Дизайн-система, токены, палитра
│   └── audit.md                 # Аудит фронтенда (чеки)
│
├── backend/                     # FastAPI backend
│   ├── app/
│   │   ├── modules/             #   30 бизнес-модулей
│   │   ├── shared/              #   Базовые классы
│   │   ├── infrastructure/      #   БД, сессии
│   │   └── middleware/          #   Multi-tenancy
│   ├── migrations/              #   Alembic миграции
│   ├── print_agent/             #   Агент печати ESC/POS
│   ├── tests/                   #   Тесты
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── pages/               #   30+ страниц
│   │   ├── components/          #   Layout, Sidebar, Topbar, UI
│   │   ├── api/                 #   Axios client, interceptors
│   │   └── styles/              #   CSS (~45K строк), marjon-tokens.css
│   ├── index.html               #   Entry: кафе (POS)
│   ├── admin.html               #   Entry: админка
│   └── vite.config.js           #   Multi-page build
│
├── .gitignore
├── CLAUDE.md                    # Инструкции для AI-агентов
├── docker-compose.yml           # Docker конфигурация
├── render.yaml                  # Render.com деплой
└── README.md                    # ← вы тут
```

## Быстрый старт

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # настроить DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Frontend работает автономно — без бэкенда показывает демо-данные с баннером «Демо-данные».

## Документация

| Документ | Описание |
|---------|----------|
| [TZ_GENERAL.md](docs/tz/TZ_GENERAL.md) | Общее ТЗ: рынок, конкуренты, архитектура, безопасность, платежи, тестирование |
| [TZ_WEB.md](docs/tz/TZ_WEB.md) | ТЗ на Web Admin Panel (React SPA) |
| [TZ_MOBILE.md](docs/tz/TZ_MOBILE.md) | ТЗ на мобильное приложение (React Native + Expo) |
| [TZ_DESKTOP.md](docs/tz/TZ_DESKTOP.md) | ТЗ на Desktop KDS (Electron) |
| [TZ_ADDENDUM.md](docs/tz/TZ_ADDENDUM.md) | Дополнение к ТЗ: user stories, offline-сценарии, миграция |
| [DOCUMENTATION.md](docs/DOCUMENTATION.md) | Полная техническая документация проекта |
| [STYLEGUIDE.md](docs/STYLEGUIDE.md) | Дизайн-система, токены, палитра Marjon |

## Платформы

| Платформа | Статус | Описание |
|-----------|--------|----------|
| **Web Admin** | 🟢 80% MVP | React SPA — управление заведением |
| **Mobile App** | 🔴 Не начато | React Native — официант, владелец, курьер |
| **Desktop KDS** | 🔴 Не начато | Electron — кухонный дисплей для поваров |
| **Print Agent** | 🟡 Backend готов | ESC/POS — печать чеков |

## API

Все эндпоинты под `/api/v1`. Основные группы:

- `/auth` — JWT авторизация (телефон + пароль)
- `/pos/orders` — заказы, статусы, оплата
- `/inventory/*` — товары, ингредиенты, техкарты
- `/warehouse/*` — склад (приход, расход, остатки, инвентаризация)
- `/analytics/*` — дашборд, KPI
- `/reports/*` — 7 типов отчётов
- `/payments/*` — Click, Payme, Uzum (webhook + create)
- `/fiscal/*` — фискализация (ОФД)
- `/ws/kitchen` — WebSocket для кухонного дисплея

## Лицензия

Проприетарный. Все права защищены.
