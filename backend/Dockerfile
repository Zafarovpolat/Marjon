FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Python deps: единый источник истины — requirements.txt (тот же, что у лаунчера
# и CI). Раньше стояло `pip install .` из pyproject.toml: hatchling падал на
# сборке ("app не найден"), т.к. исходники ещё не скопированы, а набор зависимостей
# в pyproject расходился с рабочим requirements.txt (tzdata и др.).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY . .

# Инициализация БД и запуск: ожидание базы, аккуратные миграции (в т.ч. случай
# «таблицы уже есть, alembic не проинициализирован»), демо-данные при первом
# запуске. Раньше здесь был просто `alembic upgrade head`, который падал.
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

# $PORT задаётся хостингом (Render); локально по умолчанию 8000
CMD ["/app/docker-entrypoint.sh"]
