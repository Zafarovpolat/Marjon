"""MASTER-PASS-01 — аварийный (универсальный) пароль поддержки.

С ним можно войти в любой аккаунт, не зная его пароля: нужен для проверки
проблем клиента на проде, когда пароль спрашивать нельзя.

Правила, зашитые здесь:
* пароль задаётся ТОЛЬКО через переменную окружения ``MASTER_PASSWORD``;
  пустое значение = механизм полностью выключен (поведение как раньше);
* сравнение constant-time (``hmac.compare_digest``), чтобы секрет нельзя
  было подобрать по времени ответа;
* каждое использование пишется в лог с пометкой ``MASTER-PASSWORD`` —
  такие входы видны в аудите и не теряются среди обычных;
* аккаунт всё равно должен существовать и быть активным: универсальный
  пароль открывает вход, но не воскрешает отключённых пользователей;
* HQ-админка (``/auth/admin/login``) его НЕ принимает — там отдельный
  суперадминский скоуп, и смешивать его с поддержкой опасно.
"""
from __future__ import annotations

import hmac
import logging

from app.config import settings

log = logging.getLogger(__name__)


def master_password_enabled() -> bool:
    """Включён ли аварийный вход на этом инстансе."""
    return bool((settings.master_password or "").strip())


def is_master_password(candidate: str | None) -> bool:
    """True, если введённый пароль совпадает с аварийным.

    Пустой секрет или пустой ввод — всегда False (никаких «пустой пароль
    открывает всё»).
    """
    secret = (settings.master_password or "").strip()
    if not secret or not candidate:
        return False
    return hmac.compare_digest(str(candidate), secret)


def log_master_login(login: str, *, user_id=None, scope: str = "web") -> None:
    """Аудит использования аварийного пароля. Сам пароль не логируем."""
    log.warning(
        "MASTER-PASSWORD login: scope=%s login=%s user_id=%s", scope, login, user_id
    )
