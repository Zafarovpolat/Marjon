from __future__ import annotations
import json
from functools import lru_cache

from pydantic import field_validator, model_validator
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

    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
    ]

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
    # Секрет внутренних вебхуков платёжек (из ветки bek)
    webhook_secret: str | None = None
    # MinIO / S3 — загрузка аватаров и файлов (из ветки bek)
    minio_endpoint: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket: str = "marjon"
    minio_public_url: str = "http://localhost:9000"

    class Config:
        env_file = ".env"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v):
        """Accept JSON array, comma-separated string, or empty string."""
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            # Comma-separated fallback
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @model_validator(mode="after")
    def validate_security(self):
        if not self.secret_key:
            if self.debug:
                self.secret_key = "dev-only-insecure-secret-key"
            else:
                raise ValueError("SECRET_KEY must be set when DEBUG=false")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
