# Marjon — установка на новый сервер (с нуля)

Снимок репозитория на коммит `41fe6dd` (redesign-mobile). Только то, что
нужно для продовского стека: `docker-compose.yml`, nginx, backend, фронт
(с уже собранным `frontend/dist`), лендинг, платёжные шлюзы. Mobile/Desktop/
Owner-приложения и dev-файлы сюда не входят — на сервере не разворачиваются.

## Что внутри

```
docker-compose.yml
.env.example          ← скопировать в .env и заполнить реальными значениями
nginx/                  конфиги реверс-прокси (conf.d + snippets)
landing/                статический лендинг marjon.tech
backend/                FastAPI + Alembic (собирается в контейнер Dockerfile'ом)
frontend/                исходники + frontend/dist (уже собран, готов к раздаче)
services/                payme-gateway, click-gateway, uzum-gateway (Go)
```

## Главное отличие от предыдущего сервера

**HQ-админка (видит все компании) перенесена с предсказуемого `/admin` на
секретный путь.** На `adminka.marjon.tech`:

- `/` — обычная owner-панель (кафе/POS), дефолт для владельцев.
- `/8ZoR0CHUJbLSPXjWbHp9DLWnHJQkUm59` — HQ-админка (платформенный админ).
- `/admin` и `/admin.html` возвращают 404 (явный запрет в `ssl.conf` — без
  него файл раздавался бы напрямую с диска по старому пути).

Сменить секретный путь — одна строка в `nginx/conf.d/ssl.conf`, искать
`location = /8ZoR0...`.

## 1. Docker (если ещё не установлен)

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # перелогиниться после этого, иначе дальше sudo перед каждой docker-командой
docker compose version
```

## 2. Распаковать архив

```bash
mkdir -p ~/marjon
tar -xzf ~/marjon-prod-*.tar.gz -C ~/marjon
cd ~/marjon
```

Все команды ниже — из этой директории (имя папки участвует в именах volume'ов
docker compose, не переименовывать между командами).

## 3. Настроить `.env`

```bash
cp .env.example .env
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))"
python3 -c "import secrets; print('MINIO_ROOT_PASSWORD=' + secrets.token_urlsafe(24))"
python3 -c "import secrets; print('WEBHOOK_SECRET=' + secrets.token_urlsafe(32))"
```

Впиши значения в `.env` (`nano .env`), плюс:

```
DEBUG=false
ALLOWED_ORIGINS=["https://marjon.tech","https://adminka.marjon.tech"]
BACKEND_WORKERS=3
```

(`MINIO_PUBLIC_URL` не трогать — дефолт `https://s3.marjon.tech` верный).

## 4. DNS

A-записи на IP сервера для ВСЕХ доменов — подождать, пока разрешатся:

```bash
curl -4 ifconfig.me; echo   # IP этого сервера — на него указывают A-записи
for d in marjon.tech www.marjon.tech api.marjon.tech adminka.marjon.tech s3.marjon.tech minio.marjon.tech payme.marjon.tech click.marjon.tech uzum.marjon.tech; do
  echo -n "$d -> "; dig +short "$d"
done
```

Каждая строка должна показать IP сервера, прежде чем идти дальше.

## 5. Заглушка-сертификат (чтобы nginx вообще стартовал)

Конфиги уже в HTTPS-режиме — `ssl.conf` ссылается на пути сертификата,
которых пока нет. Подставляем временный самоподписанный, в тот же volume,
что будет использовать настоящий certbot:

```bash
docker compose run --rm --entrypoint sh nginx -c "
  mkdir -p /etc/letsencrypt/live/marjon.tech &&
  apk add --no-cache openssl &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/marjon.tech/privkey.pem \
    -out /etc/letsencrypt/live/marjon.tech/fullchain.pem \
    -subj '/CN=marjon.tech'
"
```

## 6. Поднять стек

```bash
docker compose up -d
docker compose ps   # все Up (healthy у db/redis/minio)
```

> **MinIO:** `minio/minio` и `minio/mc` сняты с Docker Hub, `quay.io` тоже
> отдаёт 401 — MinIO Inc. закрыли бесплатную анонимную раздачу своего
> образа везде, включая прямой бинарник с dl.min.io. `docker-compose.yml`
> уже переключён на `docker.io/pgsty/silo` (community-форк, тот же
> root/env-контракт) — pull должен пройти без проблем. Если ОПЯТЬ
> откажет (ещё один registry прикрыли) — подставь любой другой
> S3-совместимый self-hosted образ с тем же `MINIO_ROOT_USER`/
> `MINIO_ROOT_PASSWORD` в `environment` и портами 9000/9001.

## 7. Создать bucket (без `mc` — его тоже не пулится)

Через уже поднятый backend — у него есть `boto3` и нужные креды:

```bash
docker compose exec backend python3 -c "
from app.config import settings
import boto3, json

client = boto3.client('s3', endpoint_url=settings.minio_endpoint,
                       aws_access_key_id=settings.minio_access_key,
                       aws_secret_access_key=settings.minio_secret_key)
existing = [b['Name'] for b in client.list_buckets()['Buckets']]
if settings.minio_bucket not in existing:
    client.create_bucket(Bucket=settings.minio_bucket)
policy = {'Version': '2012-10-17', 'Statement': [{
    'Effect': 'Allow', 'Principal': '*', 'Action': ['s3:GetObject'],
    'Resource': [f'arn:aws:s3:::{settings.minio_bucket}/{prefix}/*'
                 for prefix in ('products', 'categories', 'logos')],
}]}
client.put_bucket_policy(Bucket=settings.minio_bucket, Policy=json.dumps(policy))
print('MinIO bucket ready:', settings.minio_bucket)
"
```

Должно вывести `MinIO bucket ready: marjon-media`.

Публично доступны только медиа каталога и логотипы. Не открывайте весь bucket:
`avatars/` содержит приватные фотографии сотрудников.

Хранилище должно проходить `/minio/health/cluster` (готовность к записи), а не
только `/minio/health/live`. Том `minio_data:/data` нельзя размещать во временной
папке или удалять при обновлении. `docker compose down -v` удаляет тома с данными:
для обычного обновления эту команду не использовать. Постоянный том не заменяет
отдельную резервную копию фото и базы данных с проверкой восстановления.

Локальный Windows-запуск и восстановление после сбоя описаны в
[docs/local-object-storage.md](docs/local-object-storage.md).

## 8. Выпустить настоящий сертификат

Только после того, как ВСЕ 9 доменов из шага 4 резолвятся на этот сервер:

```bash
docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d marjon.tech -d www.marjon.tech -d api.marjon.tech \
  -d adminka.marjon.tech -d s3.marjon.tech -d minio.marjon.tech \
  -d payme.marjon.tech -d click.marjon.tech -d uzum.marjon.tech \
  --email support@marjon.tech --agree-tos --no-eff-email

docker compose restart nginx
```

Если ругается на `.well-known/acme-challenge` — порт 80 не открыт снаружи
(файрвол/security group), или DNS ещё не разрешился для какого-то домена.

## 9. Проверка

```bash
curl -I https://marjon.tech
curl -I https://api.marjon.tech/docs
curl -I https://adminka.marjon.tech/                                      # owner-панель, 200
curl -I https://adminka.marjon.tech/8ZoR0CHUJbLSPXjWbHp9DLWnHJQkUm59       # HQ-админка, 200
curl -I https://adminka.marjon.tech/admin                                 # 404
curl -I https://adminka.marjon.tech/admin.html                            # 404
```

## Callback-адреса для платёжных систем

Вписать в личных кабинетах Payme/Click/Uzum:
- `https://payme.marjon.tech/payme/`
- `https://click.marjon.tech/click/`
- `https://uzum.marjon.tech/uzum/`

## Что НЕ входит в этот архив (и почему)

- `mobile/`, `desktop/`, `owner/` — отдельные клиентские приложения
  (Flutter/Electron), не разворачиваются на сервере.
- `backend/print_agent/` — работает на компьютере каждого кафе, не на
  центральном сервере.
- Dev/тест-скрипты с собственным guard на `settings.debug`
  (`backend/scripts/seed_dev_data.py` и т.п.) — безопасны даже оставленные.
