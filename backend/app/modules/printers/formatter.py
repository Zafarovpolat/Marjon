"""
ESC/POS receipt and kitchen ticket formatters.
Returns bytes that can be sent directly to the printer.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from datetime import datetime


@dataclass
class ReceiptLine:
    name: str
    qty: Decimal
    price: Decimal
    total: Decimal
    modifiers: list[str] = field(default_factory=list)
    # Позиция «с собой» внутри зального/доставочного заказа (сервисный сбор
    # на неё не начисляется). Помечается в чеке отдельной строкой.
    takeaway: bool = False


@dataclass
class ReceiptData:
    company_name: str
    branch_name: str
    order_number: str
    order_type: str
    cashier_name: str
    items: list[ReceiptLine]
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal
    payment_method: str
    cash_received: Decimal | None = None
    change_given: Decimal | None = None
    table_number: str | None = None
    customer_name: str | None = None
    fiscal_code: str | None = None
    service_fee: Decimal = Decimal("0")
    waiter_name: str | None = None
    printed_at: datetime = field(default_factory=datetime.now)
    # 2.1 — раздельный чек: подпись части («Часть 1 из 3» / «Поровну: 1 из 4»).
    # None → обычный (общий) чек, печатается как раньше.
    split_note: str | None = None
    # 2.5 — JSON-шаблон из конструктора чека (companies.receipt_template).
    # None → печать по умолчанию (обратная совместимость). Форма: см.
    # frontend/src/api/receipt.js (enabled{}, thankYouText, footerText, ...).
    template: dict | None = None
    # Строки оплаты как в превью конструктора: [(подпись, сумма)]. Пусто →
    # блок оплаты не печатается вообще (чек-предсчёт печатают до оплаты).
    payments: list[tuple[str, Decimal]] = field(default_factory=list)
    # Дата в чеке — время создания заказа (в превью выводится order.created_at),
    # а не время печати. None → печатаем printed_at.
    created_at: datetime | None = None


@dataclass
class KitchenTicketData:
    order_number: str
    order_type: str
    table_number: str | None
    waiter_name: str | None
    items: list[dict]  # [{name, qty, note, modifiers, course}]
    note: str | None = None
    printed_at: datetime = field(default_factory=datetime.now)
    # 2.5 — JSON-шаблон кухонного чека (companies.kitchen_receipt_template)
    template: dict | None = None
    # Время заказа (как в превью — order.created_at); None → printed_at
    created_at: datetime | None = None
    # Срочный заказ → блок «! СРОЧНО !» (блок priority конструктора)
    is_urgent: bool = False


# Тип заказа на печати — подписи как в превью конструктора (там выводится
# order.order_type строкой «На стол» / «С собой» / «Доставка»).
_ORDER_TYPE_LABELS = {
    "dine_in": "На стол",
    "takeaway": "С собой",
    "delivery": "Доставка",
}


def order_type_label(order_type: str | None) -> str:
    key = (order_type or "").strip().lower()
    return _ORDER_TYPE_LABELS.get(key, (order_type or "").strip())


# Способ оплаты → подпись строки оплаты (как getPaymentRows() в превью)
_PAYMENT_METHOD_LABELS = {
    "cash": "Наличные",
    "card": "Карта",
    "transfer": "Перечисление",
    "mixed": "Смешанная оплата",
    "click": "Click",
    "payme": "Payme",
    "uzum": "Uzum",
}


def payment_method_label(method: str | None) -> str:
    key = (method or "").strip().lower()
    return _PAYMENT_METHOD_LABELS.get(key, (method or "").strip() or "Оплата")


# ── Контракт конструктора чека ─────────────────────────────────────────────
# blocks — порядок блоков, enabled — галочки, blockStyles — размер/выравнивание/
# жирность. Те же карты живут во фронте (frontend/src/api/receipt.js и
# components/receipt/ReceiptPreview.jsx) — поэтому печать повторяет превью.
CUSTOMER_BLOCKS = [
    "logo", "restaurantName", "address", "phone", "orderNumber", "table", "waiter",
    "dateTime", "items", "discount", "serviceFee", "vat", "total", "paymentMethod",
    "qr", "thankYouText", "footerText",
]

KITCHEN_BLOCKS = [
    "orderNumber", "table", "waiter", "createdAt", "items", "modifiers",
    "itemComments", "orderNote", "priority",
]

# Блок → визуальная группа. Группы разделяются линией; порядок групп задаёт
# первый встреченный в blocks блок группы.
_CUSTOMER_GROUPS = {
    "logo": "head", "restaurantName": "head",
    "orderNumber": "info", "table": "info", "waiter": "info", "dateTime": "info",
    "items": "items",
    "discount": "summary", "serviceFee": "summary", "vat": "summary",
    "total": "total",
    "paymentMethod": "pay",
    "qr": "qr",
    # Адрес и телефон печатаются в подвале рядом с footerText
    "thankYouText": "foot", "footerText": "foot", "address": "foot", "phone": "foot",
}

_KITCHEN_GROUPS = {
    "orderNumber": "head", "table": "head", "waiter": "head", "createdAt": "head",
    "items": "items", "modifiers": "items", "itemComments": "items",
    "orderNote": "note",
    "priority": "urgent",
}

# Эти блоки не занимают своё место в порядке групп — печатаются внутри подвала
_POSITIONLESS_BLOCKS = {"address", "phone"}

# Выключены по умолчанию (buildCustomerTemplate во фронте)
_DEFAULT_OFF_BLOCKS = {"address", "phone", "qr", "vat"}

_BASE_STYLE = {"size": "standard", "align": "left", "weight": "standard"}

# Стили по умолчанию — копия дефолтов buildCustomerTemplate()
_CUSTOMER_STYLES = {
    "restaurantName": {"size": "large", "align": "center", "weight": "bold"},
    "orderNumber": {"size": "standard", "align": "center", "weight": "bold"},
    "dateTime": {"size": "standard", "align": "center", "weight": "bold"},
    "total": {"size": "xlarge", "align": "left", "weight": "standard"},
    "thankYouText": {"size": "large", "align": "center", "weight": "bold"},
    "footerText": {"size": "large", "align": "center", "weight": "bold"},
}

# У кухонного чека своего редактора стилей нет: размеры зашиты как в превью
# (крупный номер, увеличенный текст — повар читает с расстояния).
_KITCHEN_STYLES = {
    "orderNumber": {"size": "xlarge", "align": "center", "weight": "bold"},
    "table": {"size": "large", "align": "left", "weight": "standard"},
    "waiter": {"size": "large", "align": "left", "weight": "standard"},
    "createdAt": {"size": "large", "align": "left", "weight": "standard"},
    "items": {"size": "large", "align": "left", "weight": "bold"},
    "modifiers": {"size": "large", "align": "left", "weight": "standard"},
    "itemComments": {"size": "large", "align": "left", "weight": "standard"},
    "orderNote": {"size": "large", "align": "left", "weight": "standard"},
    "priority": {"size": "large", "align": "center", "weight": "bold"},
}


# 2.5 — хелперы чтения шаблона конструктора чека. При template=None (шаблон не
# настроен) блоки берут дефолты конструктора, тексты — дефолтные подписи.
def _tpl_blocks(template: dict | None, fallback: list[str]) -> list[str]:
    """Порядок блоков из шаблона: неизвестные отбрасываем, пропущенные дописываем."""
    saved: list[str] = []
    if isinstance(template, dict) and isinstance(template.get("blocks"), list):
        for block in template["blocks"]:
            if block in fallback and block not in saved:
                saved.append(block)
    return saved + [b for b in fallback if b not in saved]


def _tpl_enabled(template: dict | None, block: str) -> bool:
    """Включён ли блок. Ключа нет → дефолт конструктора."""
    default = block not in _DEFAULT_OFF_BLOCKS
    if not isinstance(template, dict):
        return default
    enabled = template.get("enabled")
    if not isinstance(enabled, dict) or block not in enabled:
        return default
    return bool(enabled[block])


def _tpl_style(template: dict | None, block: str, defaults: dict) -> dict:
    """Стиль блока: значения из blockStyles поверх дефолта этого блока."""
    style = dict(defaults.get(block) or _BASE_STYLE)
    if isinstance(template, dict):
        raw = template.get("blockStyles")
        if isinstance(raw, dict) and isinstance(raw.get(block), dict):
            for key in ("size", "align", "weight"):
                value = raw[block].get(key)
                if isinstance(value, str) and value:
                    style[key] = value
    return style


def _group_order(blocks: list[str], groups: dict[str, str]) -> list[str]:
    """Порядок групп по порядку блоков (первое вхождение)."""
    order: list[str] = []
    for block in blocks:
        if block in _POSITIONLESS_BLOCKS:
            continue
        group = groups.get(block)
        if group and group not in order:
            order.append(group)
    return order


def _money(value) -> str:
    """Как money() в превью: без символа валюты, разряды — пробел."""
    try:
        return f"{Decimal(str(value or 0)):,.0f}".replace(",", " ")
    except (InvalidOperation, TypeError, ValueError):
        return str(value or "")


def _positive(value) -> bool:
    try:
        return Decimal(str(value or 0)) > 0
    except (InvalidOperation, TypeError, ValueError):
        return False


def _tpl_text(template: dict | None, key: str) -> str | None:
    """Непустой текстовый параметр шаблона (restaurantName/thankYouText/...)."""
    if not isinstance(template, dict):
        return None
    value = template.get(key)
    return value if isinstance(value, str) and value.strip() else None


class EscPosFormatter:
    """
    Generates ESC/POS byte sequences for thermal printers.
    Works without a physical printer — output is bytes.
    """

    ESC = b"\x1b"
    GS  = b"\x1d"
    LF  = b"\x0a"
    CUT = b"\x1d\x56\x41\x03"   # partial cut

    BOLD_ON     = ESC + b"\x45\x01"
    BOLD_OFF    = ESC + b"\x45\x00"
    ALIGN_LEFT  = ESC + b"\x61\x00"
    ALIGN_CENTER = ESC + b"\x61\x01"
    ALIGN_RIGHT = ESC + b"\x61\x02"
    DOUBLE_HEIGHT = GS + b"\x21\x01"
    DOUBLE_BOTH   = GS + b"\x21\x11"   # двойная ширина + высота
    NORMAL_SIZE   = GS + b"\x21\x00"
    INIT          = ESC + b"\x40"

    # Стиль блока из конструктора → ESC/POS
    _SIZE_BYTES = {"standard": b"\x00", "large": b"\x01", "xlarge": b"\x11"}
    _ALIGN_BYTES = {"left": b"\x00", "center": b"\x01", "right": b"\x02"}

    # Кодовые страницы для кириллицы. Термопринтер ESC/POS НЕ понимает UTF-8 —
    # надо командой ESC t n выбрать однобайтовую страницу И кодировать текст в неё.
    # Раньше текст слался в UTF-8 без выбора страницы → принтер рисовал байты своей
    # дефолтной (китайской) страницей → иероглифы. PC866 (n=17) — самый совместимый
    # вариант для русского на большинстве термопринтеров.
    _CHARSETS = {
        "cp866": (b"\x11", "cp866"),    # ESC t 17 — PC866 (кириллица), по умолчанию
        "cp1251": (b"\x49", "cp1251"),  # ESC t 73 — WPC1251
    }

    def __init__(self, paper_width: int = 80, charset: str = "cp866"):
        # 80mm ≈ 48 chars; 58mm ≈ 32 chars
        self.cols = 48 if paper_width >= 80 else 32
        page_byte, codec = self._CHARSETS.get((charset or "cp866").lower(), self._CHARSETS["cp866"])
        self._codec = codec
        # ESC t n — выбор кодовой страницы; шлём после INIT (ESC @ её сбрасывает)
        self._set_codepage = self.ESC + b"\x74" + page_byte

    def _line(self, text: str = "") -> bytes:
        # Кодируем в выбранную кодовую страницу принтера, НЕ в UTF-8
        return text.encode(self._codec, errors="replace") + self.LF

    def _divider(self, char: str = "-") -> bytes:
        return self._line(char * self.cols)

    def _dashed(self) -> bytes:
        """Пунктирная линия — как .receipt-preview__rule (не solid) в превью."""
        return self._line(("- " * (self.cols // 2)).rstrip())

    def _two_col(self, left: str, right: str, cols: int | None = None) -> bytes:
        width = cols or self.cols
        pad = width - len(left) - len(right)
        return self._line(left + " " * max(pad, 1) + right)

    # ── Стили блоков конструктора ──────────────────────────────────────────
    def _style_on(self, style: dict) -> bytes:
        """Размер (GS ! n) + выравнивание (ESC a n) + жирность (ESC E) блока."""
        out = self.GS + b"\x21" + self._SIZE_BYTES.get(style.get("size"), b"\x00")
        out += self.ESC + b"\x61" + self._ALIGN_BYTES.get(style.get("align"), b"\x00")
        if style.get("weight") == "bold":
            out += self.BOLD_ON
        return out

    def _style_off(self) -> bytes:
        return self.NORMAL_SIZE + self.BOLD_OFF + self.ALIGN_LEFT

    def _style_cols(self, style: dict) -> int:
        """При двойной ширине (xlarge) в строку влезает вдвое меньше символов."""
        return self.cols // 2 if style.get("size") == "xlarge" else self.cols

    def _styled(self, style: dict, *chunks: bytes) -> bytes:
        return self._style_on(style) + b"".join(chunks) + self._style_off()

    # ── Текст ──────────────────────────────────────────────────────────────
    def _wrap(self, text: str, width: int) -> list[str]:
        """Перенос по словам: превью длинные названия не обрезает, а переносит."""
        text = (text or "").strip()
        if not text or width < 1:
            return []
        lines: list[str] = []
        current = ""
        for word in text.split():
            while len(word) > width:        # одно слово длиннее строки — рвём
                if current:
                    lines.append(current)
                    current = ""
                lines.append(word[:width])
                word = word[width:]
            candidate = f"{current} {word}".strip()
            if len(candidate) > width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
        return lines

    def _text_block(self, text: str, style: dict) -> bytes:
        """Многострочный текст с переносом под ширину выбранного размера."""
        out = bytearray()
        for raw in (text or "").split("\n"):
            for line in self._wrap(raw, self._style_cols(style)) or [""]:
                out += self._line(line)
        return bytes(out)

    def _qr(self, data: str) -> bytes:
        """Нативный QR-код принтера (ESC/POS GS ( k): принтер сам строит матрицу
        из строки-ссылки, растровая графика не нужна. Печатается по центру."""
        payload = (data or "").strip().encode("utf-8", errors="ignore")
        if not payload:
            return b""
        module = b"\x06" if self.cols >= 48 else b"\x04"   # размер модуля под ширину бумаги
        store_len = len(payload) + 3                       # cn+fn+m + данные
        out = bytearray()
        out += self.ALIGN_CENTER
        out += self.GS + b"\x28\x6b\x04\x00\x31\x41\x32\x00"                     # модель 2
        out += self.GS + b"\x28\x6b\x03\x00\x31\x43" + module                    # размер модуля
        out += self.GS + b"\x28\x6b\x03\x00\x31\x45\x31"                         # коррекция M
        out += (self.GS + b"\x28\x6b"
                + bytes([store_len & 0xff, (store_len >> 8) & 0xff])
                + b"\x31\x50\x30" + payload)                                     # запись данных
        out += self.GS + b"\x28\x6b\x03\x00\x31\x51\x30"                         # печать символа
        out += self.ALIGN_LEFT
        return bytes(out)

    def _label_value(self, label: str, value: str, cols: int | None = None) -> bytes:
        """Строка «подпись | значение»: значение начинается ровно в правой половине
        строки и выравнивается влево — как .receipt-preview__info-row в превью."""
        width = cols or self.cols
        half = max(width // 2, 1)
        head = label if len(label) < half else label[:half - 1] + " "
        out = bytearray()
        chunks = self._wrap(value, width - half) or [""]
        out += self._line(head.ljust(half) + chunks[0])
        for extra in chunks[1:]:
            out += self._line(" " * half + extra)
        return bytes(out)

    # ── Таблица блюд (4 колонки, как grid в превью) ─────────────────────────
    def _item_cols(self, cols: int) -> tuple[int, int, int, int]:
        if cols >= 48:
            qty_w, price_w, total_w = 6, 10, 11
        else:
            qty_w, price_w, total_w = 4, 7, 8
        return cols - qty_w - price_w - total_w, qty_w, price_w, total_w

    def _four_col(self, name: str, qty: str, price: str, total: str, cols: int) -> bytes:
        name_w, qty_w, price_w, total_w = self._item_cols(cols)
        chunks = self._wrap(name, name_w) or [""]
        out = bytearray()
        out += self._line(
            chunks[0].ljust(name_w) + qty.rjust(qty_w) + price.rjust(price_w) + total.rjust(total_w)
        )
        for extra in chunks[1:]:          # длинное название переносим, не обрезаем
            out += self._line(extra)
        return bytes(out)

    def format_receipt(self, data: ReceiptData) -> bytes:
        """Собирает чек ровно так, как его показывает конструктор во фронте:
        порядок групп — из template.blocks, видимость — из enabled, размеры и
        выравнивание — из blockStyles (см. components/receipt/ReceiptPreview.jsx)."""
        tpl = data.template
        blocks = _tpl_blocks(tpl, CUSTOMER_BLOCKS)
        on = {b: _tpl_enabled(tpl, b) for b in blocks}

        sections: list[bytes] = []
        for group in _group_order(blocks, _CUSTOMER_GROUPS):
            chunk = self._receipt_group(group, data, tpl, on)
            if chunk:
                sections.append(chunk)

        out = bytearray()
        out += self.INIT
        out += self._set_codepage   # кириллическая кодовая страница (ESC @ сбрасывает её)
        for index, chunk in enumerate(sections):
            if index:
                out += self._divider()      # сплошная линия между группами
            out += chunk
        # Низ чека: пунктир + «НОМЕР ЗАКАЗА» крупно — в превью есть всегда
        out += self._dashed()
        out += self._styled({"size": "standard", "align": "center", "weight": "bold"},
                            self._line("НОМЕР ЗАКАЗА"))
        out += self._styled({"size": "xlarge", "align": "center", "weight": "bold"},
                            self._line(str(data.order_number or "-")))
        out += self.LF * 3
        out += self.CUT
        return bytes(out)

    def _receipt_group(self, group: str, data: ReceiptData, tpl: dict | None, on: dict) -> bytes:
        """Одна группа чека покупателя. Пусто → группа не печатается вообще."""
        def style(block: str) -> dict:
            return _tpl_style(tpl, block, _CUSTOMER_STYLES)

        out = bytearray()

        # Логотип не печатаем: в шаблоне это SVG, растровой печати нет
        if group == "head":
            if on.get("restaurantName"):
                title = _tpl_text(tpl, "restaurantName") or data.company_name
                st = style("restaurantName")
                out += self._styled(st, self._text_block(title, st))

        elif group == "info":
            rows: list[tuple[str, str, dict]] = []
            if on.get("orderNumber"):
                rows.append(("Номер заказа:", str(data.order_number or "-"), style("orderNumber")))
                type_label = order_type_label(data.order_type)
                if type_label:
                    rows.append(("Тип заказа:", type_label, style("orderNumber")))
            if on.get("table") and data.table_number:
                rows.append(("Номер стола:", str(data.table_number), style("table")))
            waiter = data.waiter_name or data.cashier_name
            if on.get("waiter") and waiter:
                rows.append(("Официант:", waiter, style("waiter")))
            if on.get("dateTime"):
                stamp = data.created_at or data.printed_at
                rows.append(("Дата:", stamp.strftime("%d.%m.%Y %H:%M"), style("dateTime")))
            for label, value, st in rows:
                out += self._styled(st, self._label_value(label, value, self._style_cols(st)))
            # 2.1 — раздельный чек: своего блока в конструкторе нет, подпись части
            # печатаем отдельной жирной строкой
            if data.split_note:
                out += self._styled({"size": "standard", "align": "center", "weight": "bold"},
                                    self._text_block(data.split_note, _BASE_STYLE))

        # Таблица блюд: 4 колонки как grid в превью. При раздельном чеке у части
        # может не быть позиций («поровну») — тогда группа пустая.
        elif group == "items":
            if on.get("items") and data.items:
                st = style("items")
                cols = self._style_cols(st)
                out += self._styled({**st, "weight": "bold"},
                                    self._four_col("НАИМЕНОВАНИЕ", "КОЛ-ВО", "ЦЕНА", "ИТОГО", cols))
                for item in data.items:
                    out += self._styled(st, self._four_col(
                        item.name, _money(item.qty), _money(item.price), _money(item.total), cols,
                    ))

        elif group == "summary":
            # «Сумма товаров» отдельного блока не имеет — печатается всегда,
            # остальные строки только при значении > 0 (как в превью)
            rows = [
                ("Сумма товаров", data.subtotal, True),
                ("Скидка", data.discount, on.get("discount")),
                ("Обслуживание", getattr(data, "service_fee", 0), on.get("serviceFee")),
                ("Налог", data.tax, on.get("vat")),
            ]
            for label, value, allowed in rows:
                if allowed and _positive(value):
                    out += self._two_col(label, _money(value))

        elif group == "total":
            if on.get("total"):
                st = style("total")
                out += self._styled(st, self._two_col("ИТОГО:", _money(data.total),
                                                      self._style_cols(st)))

        elif group == "pay":
            # Оплат ещё нет (чек-предсчёт печатают до оплаты) → блок пропускаем
            if on.get("paymentMethod"):
                st = style("paymentMethod")
                for label, amount in self._payment_rows(data):
                    out += self._styled(st, self._two_col(f"{label}:", _money(amount),
                                                          self._style_cols(st)))

        elif group == "qr":
            # Ссылку из конструктора печатаем НАСТОЯЩИМ QR (нативная команда
            # принтера). Фискальный номер, если есть, — подписью снизу, как в превью.
            if on.get("qr"):
                qr_url = _tpl_text(tpl, "qrUrl")
                if qr_url:
                    out += self._qr(qr_url)
                if data.fiscal_code:
                    out += self._styled({"size": "standard", "align": "center", "weight": "standard"},
                                        self._line(f"ФН: {data.fiscal_code}"))

        elif group == "foot":
            if on.get("thankYouText"):
                st = style("thankYouText")
                text = _tpl_text(tpl, "thankYouText") or "XARIDINGIZ UCHUN RAXMAT!"
                out += self._styled(st, self._text_block(text, st))
            # Контакты подвала: footerText, затем телефон и адрес (если включены)
            st = style("footerText")
            contacts = []
            if on.get("footerText"):
                contacts.append(_tpl_text(tpl, "footerText"))
            if on.get("phone"):
                contacts.append(_tpl_text(tpl, "phone"))
            if on.get("address"):
                contacts.append(_tpl_text(tpl, "address"))
            for contact in [c for c in contacts if c]:
                out += self._styled(st, self._text_block(contact, st))

        return bytes(out)

    def _payment_rows(self, data: ReceiptData) -> list[tuple[str, Decimal]]:
        """Как getPaymentRows() в превью: строки с суммой > 0, иначе одна строка
        по способу оплаты. Ни того, ни другого → блока оплаты в чеке нет."""
        rows = [(label, amount) for label, amount in (data.payments or []) if _positive(amount)]
        if not rows and data.payment_method and _positive(data.total):
            rows.append((payment_method_label(data.payment_method), data.total))
        return rows

    def format_kitchen_ticket(self, data: KitchenTicketData) -> bytes:
        """Кухонный чек — как превью конструктора чека повара: крупный номер,
        строки «Стол/Официант/Время», позиции, комментарий, «! СРОЧНО !»."""
        tpl = data.template
        blocks = _tpl_blocks(tpl, KITCHEN_BLOCKS)
        on = {b: _tpl_enabled(tpl, b) for b in blocks}

        sections: list[bytes] = []
        for group in _group_order(blocks, _KITCHEN_GROUPS):
            chunk = self._kitchen_group(group, data, tpl, on)
            if chunk:
                sections.append(chunk)

        out = bytearray()
        out += self.INIT
        out += self._set_codepage   # кириллическая кодовая страница (ESC @ сбрасывает её)
        for index, chunk in enumerate(sections):
            if index:
                out += self._dashed()   # в превью кухонный чек делят пунктиры
            out += chunk
        out += self.LF * 3
        out += self.CUT
        return bytes(out)

    def _kitchen_group(self, group: str, data: KitchenTicketData, tpl: dict | None, on: dict) -> bytes:
        """Одна группа кухонного чека. Пусто → группа не печатается."""
        def style(block: str) -> dict:
            return _tpl_style(tpl, block, _KITCHEN_STYLES)

        out = bytearray()

        if group == "head":
            if on.get("orderNumber"):
                st = style("orderNumber")
                out += self._styled(st, self._line(f"#{data.order_number}"))
            # Значение справа — как .receipt-preview--kitchen .receipt-preview__info-row
            rows: list[tuple[str, str, dict]] = []
            if on.get("table") and data.table_number:
                rows.append(("Стол:", str(data.table_number), style("table")))
            if on.get("waiter") and data.waiter_name:
                rows.append(("Официант:", data.waiter_name, style("waiter")))
            if on.get("createdAt"):
                stamp = data.created_at or data.printed_at
                rows.append(("Время:", stamp.strftime("%d.%m.%Y, %H:%M"), style("createdAt")))
            for label, value, st in rows:
                out += self._styled(st, self._two_col(label, value, self._style_cols(st)))

        elif group == "items":
            if on.get("items"):
                st_item = style("items")
                st_note = style("modifiers")
                for item in data.items:
                    name = f"{_money(item.get('qty', 1))} x {item.get('name', '')}"
                    out += self._styled(st_item, self._text_block(name, st_item))
                    notes = []
                    if on.get("modifiers"):
                        mods = ", ".join(str(m) for m in (item.get("modifiers") or []) if m)
                        if mods:
                            notes.append(mods)
                    if on.get("itemComments") and item.get("note"):
                        notes.append(str(item["note"]))
                    for note in notes:
                        out += self._styled(st_note, self._text_block(f"- {note}", st_note))

        elif group == "note":
            if on.get("orderNote") and data.note:
                st = style("orderNote")
                out += self._styled({**st, "weight": "bold"}, self._line("Комментарий:"))
                out += self._styled(st, self._text_block(f"- {data.note}", st))

        elif group == "urgent":
            if on.get("priority") and data.is_urgent:
                st = style("priority")
                out += self._styled(st, self._text_block("! СРОЧНО !", st))

        return bytes(out)

    def format_summary(self, title: str, lines: list[str], footer: str | None = None) -> bytes:
        """
        Общий чек: заголовок по центру + произвольные строки + итог.
        Используется для сводной печати из Истории и Отчётов.
        """
        out = bytearray()
        out += self.INIT
        out += self._set_codepage
        out += self.ALIGN_CENTER
        out += self.BOLD_ON + self.DOUBLE_HEIGHT
        out += self._line(title[: self.cols])
        out += self.NORMAL_SIZE + self.BOLD_OFF
        out += self._line(datetime.now().strftime("%d.%m.%Y %H:%M:%S"))
        out += self._divider()
        out += self.ALIGN_LEFT
        for ln in lines:
            out += self._line(ln[: self.cols])
        if footer:
            out += self._divider()
            out += self.BOLD_ON
            out += self._line(footer[: self.cols])
            out += self.BOLD_OFF
        out += self.LF * 3
        out += self.CUT
        return bytes(out)
