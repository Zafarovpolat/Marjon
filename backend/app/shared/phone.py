"""Нормализация телефонных номеров (Узбекистан).

Зеркало десктопного `desktop/src/shared/phone.js`: канонический вид номера —
`+998XXXXXXXXX` (код страны 998 + 9 значащих цифр). Используется на обеих
сторонах логина филиала (6.2): десктоп шлёт номер маской, бэкенд приводит его
к тому же каноничному виду и на записи (BranchService, seed), и на чтении
(AuthService.login_by_branch) — чтобы сравнение по глобально уникальному
индексу `ix_branches_login` было консистентным.
"""
from __future__ import annotations

import re

# Ровно 9 значащих цифр после кода страны 998 (напр. 90 123 45 67)
_UZ_LOCAL_LEN = 9


def extract_phone_digits(raw: str | None) -> str:
    """Достаёт до 9 локальных цифр номера (без кода 998, без разделителей)."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if digits.startswith("998"):
        digits = digits[3:]
    return digits[:_UZ_LOCAL_LEN]


def normalize_branch_login(raw: str | None) -> str:
    """Приводит логин филиала к каноничному номеру `+998XXXXXXXXX`.

    Если во входной строке ровно 9 локальных цифр (полный узбекский номер) —
    возвращает `+998` + цифры. Иначе (пустая строка, неполный номер или
    не-телефонный логин) возвращает исходную строку без крайних пробелов:
    так поддерживаются возможные старые текстовые логины, заведённые в
    веб-админке до перехода на вход по телефону.
    """
    s = str(raw or "").strip()
    if not s:
        return ""
    digits = extract_phone_digits(s)
    if len(digits) == _UZ_LOCAL_LEN:
        return "+998" + digits
    return s
