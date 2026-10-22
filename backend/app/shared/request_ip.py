"""ATT-IP-01 — реальный IP клиента для журналов (посещаемость, аудит).

Бэкенд живёт за nginx в docker-compose, поэтому `request.client.host` внутри
контейнера — это адрес самого nginx (172.18.0.x), а не сотрудника. Настоящий
адрес приходит заголовками: `nginx/snippets/proxy-common.conf` выставляет
`X-Real-IP $remote_addr` и `X-Forwarded-For $proxy_add_x_forwarded_for`.

Порядок доверия:
1. `X-Real-IP` — nginx перезаписывает его своим `$remote_addr`, подделать извне
   нельзя, поэтому он первый.
2. `X-Forwarded-For` — берём ПОСЛЕДНИЙ элемент: `$proxy_add_x_forwarded_for`
   дописывает реальный адрес в конец, а всё, что клиент прислал сам, остаётся
   в начале списка и легко подделывается.
3. `request.client.host` — локальный запуск без прокси (dev, тесты).

Всё, что не разбирается как IP, отбрасываем: в БД не должно быть мусора вида
"unknown" или "1.2.3.4:5678". Значение необязательное — исторические смены
остаются без IP, и UI честно показывает «—».
"""
from __future__ import annotations

from ipaddress import ip_address

# Колонки в БД — String(64): IPv6 с зоной/портом влезает с запасом.
MAX_IP_LENGTH = 64


def normalize_ip(value: str | None) -> str | None:
    """Привести строку к каноническому IP или вернуть None.

    Снимает пробелы, порт (`1.2.3.4:5678`), IPv6-скобки (`[::1]:8000`) и
    зону (`fe80::1%eth0`). Всё остальное — не IP.
    """
    if not value:
        return None
    text = str(value).strip().strip('"')
    if not text:
        return None
    # "[::1]:8000" → "::1"; "1.2.3.4:5678" → "1.2.3.4"
    if text.startswith("[") and "]" in text:
        text = text[1:text.index("]")]
    elif text.count(":") == 1:
        host, _, port = text.partition(":")
        if port.isdigit():
            text = host
    # Зона IPv6 не нужна и ломает разбор на части адресов.
    text = text.split("%", 1)[0]
    try:
        parsed = ip_address(text)
    except ValueError:
        return None
    # IPv4-mapped IPv6 (::ffff:10.0.0.1) — показываем как IPv4: короче и понятнее.
    mapped = getattr(parsed, "ipv4_mapped", None)
    if mapped is not None:
        parsed = mapped
    return str(parsed)[:MAX_IP_LENGTH]


def client_ip(request) -> str | None:
    """IP клиента из запроса FastAPI/Starlette (см. порядок доверия в докстринге)."""
    if request is None:
        return None

    headers = getattr(request, "headers", None)
    if headers is not None:
        real_ip = normalize_ip(headers.get("x-real-ip"))
        if real_ip:
            return real_ip

        forwarded = headers.get("x-forwarded-for")
        if forwarded:
            hops = [part for part in str(forwarded).split(",") if part.strip()]
            for hop in reversed(hops):
                parsed = normalize_ip(hop)
                if parsed:
                    return parsed

    peer = getattr(request, "client", None)
    return normalize_ip(getattr(peer, "host", None))
