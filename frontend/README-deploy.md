# Деплой веб-панели (adminka.marjon.tech)

Временный адрес, пока не определились с финальным доменом — `nginx` просто
раздаёт статику из `frontend/dist`, без контейнера и без пересборки на сервере.

## Собрать

```bash
cd frontend
npm install
npm run build
```

`.env.production` в этой папке уже задаёт `VITE_API_URL` и
`VITE_ADMIN_API_URL` = `https://api.marjon.tech/api/v1` — Vite подставляет
их в бандл на этапе сборки (`npm run build` без флагов достаточно, `--mode`
указывать не нужно, "production" — режим по умолчанию для `vite build`).

Проверить, что адрес реально зашился (не должно быть `127.0.0.1:8000`):

```bash
grep -o "api.marjon.tech[^\"']*" dist/assets/admin-*.js dist/assets/kafe-*.js
```

## Залить на сервер

`nginx` (см. `../nginx/conf.d/adminka.conf`) ждёт файлы в `frontend/dist`
рядом с `docker-compose.yml` — просто скопируйте папку `dist/` на сервер
поверх существующей, ничего перезапускать не нужно (volume mount).

```bash
rsync -av --delete dist/ user@server:/path/to/Marjon/frontend/dist/
```

## Пересборка при изменениях

Меняется код фронта → `npm run build` (локально или на сервере, где есть
node) → залить `dist/` заново. `nginx` подхватывает новые файлы сразу.
