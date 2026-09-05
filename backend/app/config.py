from __future__ import annotations
import json
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Marjon — SaaS Restaurant Platform"
    debug: bool = False

    secret_key: str | None = None
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    database_url: str = "postgresql+asyncpg://marjon:marjon_secret@localhost:5432/marjon"
    migration_database_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    port: int = 8000  # Render sets PORT env var

    # ВАЖНО: тип именно str. Для полей-СПИСКОВ pydantic-settings пытается
    # JSON-декодировать значение из ENV ещё в источнике (до валидаторов), из-за
    # чего ALLOWED_ORIGINS вида "http://a,http://b" или "*" ронял старт. Со строкой
    # этого не происходит; готовый список отдаёт свойство cors_origins
    # (принимает запятую, JSON-массив или "*").
    allowed_origins: str = (
        "http://localhost:3000,http://localhost:5173,http://localhost:5174,"
        "http://localhost:5175,http://localhost:5176,http://localhost:5177,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,"
        "http://127.0.0.1:5176,http://127.0.0.1:5177"
    )

    # Бизнес-настройки
    default_tax_rate: float = 0.12  # НДС 12% (Узбекистан)
    default_service_fee_rate: float = 0.0  # Сервисный сбор (0% по умолчанию)
    password_min_length: int = 8

    # Интеграции главной админки (ТЗ §8); пустые значения = интеграция выключена
    devent_base_url: str | None = None
    devent_api_key: str | None = None

    # ОФД фискализация (soliq.uz / ЦОТУ)
    fiscal_enabled: bool = False
    ofd_api_url: str = "https://ofd.soliq.uz/api/v1"
    ofd_api_key: str | None = None
    ofd_tin: str | None = None

    # Платёжные провайдеры
    click_merchant_id: str | None = None
    click_service_id: str | None = None
    click_secret_key: str | None = None
    payme_merchant_id: str | None = None
    payme_secret_key: str | None = None
    uzum_service_id: str | None = None
    uzum_secret_key: str | None = None
    # Секрет внутренних вебхуков платёжек. Дефолт пустой: verify_secret в
    # payments/internal_router.py fail-closed, поэтому без ENV внутренние
    # эндпоинты просто закрыты — заглушки-секрета в коде не держим.
    webhook_secret: str | None = None

    # MinIO / S3 — аватары, логотипы, картинки блюд. Значения по умолчанию —
    # для локального контейнера MinIO из docker-compose (там же и бакет
    # marjon-media); на проде переопределяются через ENV.
    minio_endpoint: str = "http://localhost:9000"    # internal URL (backend -> MinIO)
    minio_public_url: str = "http://localhost:9000"  # external URL (отдаём клиентам)
    minio_access_key: str = "marjon"
    minio_secret_key: str = "marjon_secret"
    minio_bucket: str = "marjon-media"

    class Config:
        env_file = ".env"

    @property
    def cors_origins(self) -> list[str]:
        """Список origin для CORS: принимает JSON-массив, строку через запятую или '*'."""
        raw = (self.allowed_origins or "").strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except (json.JSONDecodeError, TypeError):
            pass
        return [s.strip() for s in raw.split(",") if s.strip()]

    @model_validator(mode="after")
    def validate_security(self):
        if not self.secret_key:
            if self.debug:
                # Не хардкодим публично известный ключ (иначе при случайном DEBUG=true
                # на проде можно было бы подделать любой JWT). Генерируем эфемерный
                # на процесс: токены не переживут рестарт — приемлемо для локалки.
                import secrets
                self.secret_key = secrets.token_urlsafe(48)
            else:
                raise ValueError("SECRET_KEY must be set when DEBUG=false")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
