# Marjon Desktop — уменьшение размера .exe (план миграции)

## Проблема
Установщик Electron-приложения (`desktop/`) весит ~77 МБ; распакованное — ~200–250 МБ.
Это нормально для Electron: внутри бандла целый Chromium + Node.js. Радикально
уменьшить, оставаясь на Electron, нельзя.

## Ориентировочные размеры
| Вариант | Установщик .exe | Язык шелла | Веб-движок | Порог входа |
|---|---|---|---|---|
| Electron (сейчас) | ~77 МБ | JS / Node | свой Chromium | — |
| Electron, ужатый | ~55–65 МБ | JS / Node | свой Chromium | низкий (только конфиг) |
| **Wails (Go)** | **~10–15 МБ** | Go | WebView2 (Chromium) | низкий — Go уже в стеке |
| **Tauri (Rust)** | **~4–10 МБ** | Rust | WebView2 (Chromium) | высокий (Rust) |
| Photino / .NET (C#) | ~15–40 МБ | C# | WebView2 | средний (+.NET) |

Цифры — типичные для фреймворков, не замер конкретного билда.

## Рекомендация
1. **Быстро и без риска сейчас:** ужать Electron до ~55–60 МБ (убрать неиспользуемые
   локали Chromium, максимальное сжатие NSIS/7z, asar, одна архитектура). Выигрыш
   скромный, дизайн/логика не трогаются.
2. **Основной путь на будущее — Wails (Go):** не Rust, компилируемый и быстрый язык,
   команда **уже пишет на Go** (платёжные шлюзы `services/*-gateway`), нативный код
   переносится с Node почти 1:1. Веб остаётся отличным — WebView2 это движок Edge
   (Chromium), React-фронт переносится как есть. Размер ~10–15 МБ (×5–7 меньше).
3. **Tauri (Rust)** — если нужен абсолютный минимум размера (~5–10 МБ) и команда
   готова к Rust. Порог входа выше, native-код переписывается на Rust.

## Что придётся перенести (native-поверхность main-процесса)
Источник: `desktop/electron/main.js` (335 строк) + `desktop/electron/preload.js` (мост
`window.electron.*`). Рендерер (React, `desktop/src/`) переносится почти без изменений —
меняются только вызовы `window.electron.*` на аналог Wails/Tauri.

IPC-команды (обработчики `ipcMain.handle`), которые нужно реализовать заново:
- `window:minimize`
- `window:toggleFullscreen`
- `window:isFullscreen`
- `window:setFullScreen`
- `window:setKiosk`
- `window:setLocked` (+ событие `onRequestExitPin` — экран блокировки терминала)
- `window:allowCloseOnce`
- `window:zoomIn` / `window:zoomOut` / `window:setZoom` / `window:getZoom`
- `app:setAutoLaunch` (автозапуск при старте ОС)
- `printer:print` — TCP на `ip:9100`, ESC/POS-байты (base64) — `net.createConnection`
- `printer:ping` — проверка доступности принтера — `net.createConnection`
- `localws:info` / `localws:broadcast` / `localws:set-server-url` — локальный
  HTTP+WebSocket-сервер (`http.createServer` + `ws`, `proxyToCloud`)

Плюс инфраструктура:
- локальный HTTP+WS сервер (`http` + `ws`) → Go `net/http` + `gorilla/websocket`
  (Wails) или `axum`/`tokio-tungstenite` (Tauri);
- автообновление (`electron-updater`) → апдейтер Wails/Tauri (другой формат манифеста);
- single-instance lock;
- окно киоска/полноэкран/блокировка/zoom.

Потребители в рендерере (что переключить с `window.electron` на invoke/bindings):
- `desktop/src/components/SettingsModal.jsx` — `print`, `pingPrinter`, zoom, autolaunch;
- `desktop/src/App.jsx` — `setLocked`, `onRequestExitPin` (блокировка терминала);
- `desktop/src/shared/ws.js` / режимы — если используют `localws:*`.

## Пошаговый план — Wails (Go), рекомендованный
0. Ветка `desktop-wails`, не трогаем текущий Electron до готовности.
1. `wails init` (Go + React-шаблон); подключить существующий `desktop/src` как frontend
   (Vite-сборка), проверить, что UI рендерится в WebView2.
2. Перенести native-команды в Go (`app.go`), связать через `wails.Bind`:
   - печать/пинг: `net.Dial("tcp", ip:port)` + запись ESC/POS-байт;
   - локальный WS-сервер: `net/http` + `gorilla/websocket`;
   - окно: `runtime.WindowFullscreen`, kiosk/zoom — через Wails runtime и, где нужно,
     Win32-вызовы (`golang.org/x/sys/windows`);
   - автозапуск: реестр `Run` (Win32) или библиотека автозапуска.
3. Заменить в рендерере `window.electron.X()` на сгенерированные Wails-биндинги
   (`import { X } from '../wailsjs/go/main/App'`). Точечно, по списку выше.
4. Автообновление: подобрать решение (свой апдейтер или сторонний пакет) — у Wails это
   не «из коробки», заложить время.
5. Собрать `wails build -nsis`, замерить размер, прогнать сценарии: логин → филиал →
   сотрудник → PIN → касса → печать чека (клиентский и кухонный, 58/80 мм) →
   блокировка/разблокировка терминала → киоск.
6. Добавить в CI (smoke.yml) задачу сборки Wails (Go build) по аналогии с `gateways`.

## Пошаговый план — Tauri (Rust), альтернатива для минимального размера
0. Ветка `desktop-tauri`.
1. `npm create tauri-app` с существующим `desktop/src` как frontend.
2. Перенести native-команды в Rust (`src-tauri/src/`) как `#[tauri::command]`:
   - печать/пинг: `std::net::TcpStream`;
   - локальный WS-сервер: `axum` + `tokio-tungstenite`;
   - окно/киоск/zoom: Tauri window API + плагины;
   - автозапуск: `tauri-plugin-autostart`.
3. Рендерер: `window.electron.X()` → `invoke('x', {...})` (`@tauri-apps/api`).
4. Автообновление: `tauri-plugin-updater` (нужны ключи подписи и манифест).
5. Сборка `tauri build`, замер, те же сценарии тестирования, что и для Wails.
6. CI: задача сборки Tauri (Rust) в smoke.yml.

## Общие предостережения (для обоих)
- **WebView2 на старых Win10-кассах** может требовать доустановки рантайма; установщик
  Wails/Tauri умеет тянуть bootstrapper. На Win11 WebView2 встроен.
- **Автообновление** менее «из коробки», чем в Electron — заложить отдельно.
- **Киоск / блокировка окна / глобальный zoom** — проверить покрытие API, часть может
  потребовать нативных Win32-вызовов.
- Печать останется прежней по смыслу: TCP на `ip:9100`, ESC/POS-байты; кодировку
  кириллицы (PC866 / `ESC t 17`) формирует backend, шелл только доставляет байты.

## Оценка объёма
- Electron-ужатие: часы.
- Wails/Tauri миграция: несколько дней разработки + перепроверка печати/киоска/блокировки.
  Wails для этой команды дешевле (Go уже знают; Node→Go порт net/http/ws почти 1:1).
