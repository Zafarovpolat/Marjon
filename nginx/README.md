# Nginx + HTTPS для marjon.tech и поддоменов

## Домены

| Домен | Куда | Назначение |
|---|---|---|
| `marjon.tech`, `www.marjon.tech` | статика `landing/` | лендинг + `/privacy.html` |
| `api.marjon.tech` | `backend:8000` | FastAPI, WebSocket `/ws/kitchen` |
| `adminka.marjon.tech` | статика `frontend/dist` | веб-панель владельцев (`index.html`, дефолт на `/`) |
| `adminka.marjon.tech/8ZoR0CHUJbLSPXjWbHp9DLWnHJQkUm59` | статика `frontend/dist` | HQ-админка (`admin.html`, видит все компании) — секретный путь, см. `conf.d/ssl.conf` |
| `s3.marjon.tech` | `minio:9000` | публичные URL файлов (фото, лого) |
| `minio.marjon.tech` | `minio:9001` | консоль MinIO |
| `payme.marjon.tech` | `payme-gateway:8001` | webhook Payme |
| `click.marjon.tech` | `click-gateway:8002` | webhook Click |
| `uzum.marjon.tech` | `uzum-gateway:8003` | webhook Uzum |

## Локально

```bash
docker compose up -d nginx
curl -H "Host: marjon.tech" http://localhost/
curl -H "Host: marjon.tech" http://localhost/privacy.html
curl -H "Host: adminka.marjon.tech" http://localhost/
curl -H "Host: api.marjon.tech" http://localhost/docs
curl -H "Host: s3.marjon.tech" http://localhost/marjon-media/
curl -H "Host: minio.marjon.tech" http://localhost/
```

Локально сертификат не получить (DNS никуда не резолвится) — `nginx` слушает
80/443, но по 443 сертификата ещё нет, HTTPS локально не поднимется. Это
нормально — этот шаг только для реального сервера, ниже.

## На сервере (первый деплой)

1. **DNS**: A-записи на IP сервера для всех восьми доменов из таблицы выше
   (включая `www`). Подождите, пока разрешатся (`dig api.marjon.tech`).

2. **Собрать фронт** (см. `../frontend/README-deploy.md`) — `nginx`
   раздаёт `frontend/dist` как есть, сам не собирает.

3. **Поднять стек** (`nginx/conf.d/*.conf` уже HTTP-only, ssl ещё
   выключен — это специально, иначе первый certbot-запрос не пройдёт):

   ```bash
   docker compose up -d
   ```

4. **Выпустить сертификат** (один SAN-сертификат на все домены).

   Сервису `certbot` в docker-compose.yml задан свой `entrypoint` — бесконечный
   цикл автопродления (`certbot renew` + `sleep 12h`). `docker compose run`
   заменяет только `command`, entrypoint остаётся тем же — поэтому без
   `--entrypoint certbot` ваши `certonly ...` аргументы молча проглотятся,
   реально запустится цикл продления (ему продлевать ещё нечего, он разово
   провалится/пропустит и уйдёт в sleep 12h — выглядит как зависшая команда,
   а на деле контейнер просто спит). Обязательно с `--entrypoint`:

   ```bash
   docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
     -d marjon.tech -d www.marjon.tech -d api.marjon.tech \
     -d adminka.marjon.tech -d s3.marjon.tech -d minio.marjon.tech \
     -d payme.marjon.tech -d click.marjon.tech -d uzum.marjon.tech \
     --email support@marjon.tech --agree-tos --no-eff-email
   ```

   Если ругается на `.well-known/acme-challenge` — проверьте, что порт 80
   реально доступен снаружи (файрвол/security group) и DNS уже разрешился
   для ВСЕХ доменов из списка (упадёт вся команда, если хоть один не резолвится).

5. **Включить HTTPS**:

   ```bash
   mv nginx/conf.d/ssl.conf.example nginx/conf.d/ssl.conf
   ```

   В каждом `.conf`-файле этой папки (`default.conf`, `adminka.conf`,
   `storage.conf`, `payments.conf`) замените `location /` на редирект
   (готовый сниппет — в комментарии внизу `default.conf`), оставив
   `include /etc/nginx/snippets/acme-challenge.conf;` как есть.

   ```bash
   docker compose restart nginx
   ```

6. **Проверить**: каждый из восьми доменов по `https://` — все с валидным
   замком (`curl -I https://api.marjon.tech/docs` и т.д.).

Дальше `certbot` в фоне сам продлевает сертификат каждые 12 часов
(no-op, пока не подходит срок) — ничего руками делать не нужно.

## Callback-адреса для платёжных систем

В личных кабинетах Payme / Click / Uzum укажите:
- Payme: `https://payme.marjon.tech/payme/`
- Click: `https://click.marjon.tech/click/`
- Uzum: `https://uzum.marjon.tech/uzum/`

## Что дальше при обновлении

- **Лендинг**: перезалить `landing/index.html` / `landing/privacy.html` на
  сервер — файлы отдаются напрямую (volume mount), nginx перезапускать не надо.
- **Веб-панель**: пересобрать (`npm run build` в `frontend/`), перезалить
  `frontend/dist` — так же без перезапуска nginx.
- **Секретный путь HQ-админки**: сменить в `conf.d/ssl.conf` (location внутри
  блока `adminka.marjon.tech`) — после правки `docker compose restart nginx`.
  Путь нигде больше не хранится и не логируется намеренно.
- **backend/шлюзы**: `docker compose up -d --build backend` (или нужный сервис).
