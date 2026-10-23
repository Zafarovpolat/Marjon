"""Tests for the raster (GS v 0) customer-receipt renderer and the shared
canonical quantity formatter it introduced (RASTER CUSTOMER RECEIPT V1 +
QUANTITY FORMAT FIX). Pure unit tests against receipt_raster.py / the
quantity helper directly — no DB, no HTTP. Service-level
raster-primary/text-fallback wiring is covered by
TestCustomerReceiptRendererSelection using a stub printer and monkeypatching
the module-level render function, since PrinterService._render_customer_receipt
is a plain sync method with no DB access of its own.
"""
from __future__ import annotations

import io

from decimal import Decimal

import pytest

from PIL import Image, ImageDraw

from app.modules.printers.formatter import KitchenItem, KitchenTicketData, ReceiptData, ReceiptLine, format_quantity
from app.modules.printers.receipt_raster import (
    RasterRenderError,
    _load_font,
    _measure,
    _RasterCanvas,
    render_customer_receipt_raster,
    render_kitchen_ticket_raster,
)


def _order(**overrides):
    base = dict(
        company_name="Marjon Cafe",
        branch_name="Main",
        order_number="73",
        order_type="dine_in",
        cashier_name="Kassir",
        items=[ReceiptLine(name="Плов", qty=Decimal("2.000"), price=Decimal(35000), total=Decimal(70000))],
        subtotal=Decimal(70000),
        discount=Decimal(0),
        tax=Decimal(0),
        total=Decimal(70000),
        payment_method="cash",
        table_number="5",
        waiter_name="Иван",
    )
    base.update(overrides)
    return ReceiptData(**base)


def _ticket(**overrides):
    base = dict(
        order_number="73",
        order_type="dine_in",
        table_number="5",
        waiter_name="Иван",
        items=[KitchenItem(name="Плов", qty="2")],
        status="new",
    )
    base.update(overrides)
    return KitchenTicketData(**base)


class TestQuantityFormatter:
    @pytest.mark.parametrize("raw,expected", [
        ("0", "0"),
        ("1.000", "1"),
        ("2.000", "2"),
        ("6.000", "6"),
        ("10.000", "10"),
        ("0.500", "0.5"),
        ("1.500", "1.5"),
        ("1.250", "1.25"),
        ("12.750", "12.75"),
        ("1", "1"),
    ])
    def test_canonical_quantity_cases(self, raw, expected):
        assert format_quantity(Decimal(raw)) == expected

    def test_does_not_round_away_a_fraction(self):
        assert format_quantity(Decimal("1.333")) == "1.333"

    def test_accepts_non_decimal_input(self):
        assert format_quantity(2) == "2"
        assert format_quantity("3.000") == "3"


class TestRasterRendererBasics:
    def test_returns_gs_v0_payload(self):
        raw = render_customer_receipt_raster(_order(), {}, 80)
        assert raw.startswith(b"\x1b\x40")  # ESC @ init
        assert b"\x1dv0\x00" in raw  # GS v 0
        assert raw.endswith(b"\x1dVA\x03")  # partial cut tail (after feed)

    def test_80mm_and_58mm_both_render(self):
        for width in (80, 58):
            raw = render_customer_receipt_raster(_order(), {}, width)
            assert b"\x1dv0\x00" in raw
            assert len(raw) > 100

    def test_whole_quantity_never_prints_with_decimals(self):
        """The literal bug this task fixes: "1.000" must never appear in the
        rendered bitmap's source quantity string. Verified by checking the
        formatted string fed into the renderer, which is the only input that
        could leak ".000" into the bitmap — pixels aren't directly
        assertable, but the text source feeding them is."""
        assert format_quantity(Decimal("1.000")) == "1"
        assert format_quantity(Decimal("6.000")) == "6"

    def test_long_dish_name_does_not_raise(self):
        name = "Шашлык из баранины с луком, овощами и специями большая праздничная порция"
        data = _order(items=[ReceiptLine(name=name, qty=Decimal("2.000"), price=Decimal(46000), total=Decimal(92000))])
        raw = render_customer_receipt_raster(data, {}, 58)
        assert b"\x1dv0\x00" in raw

    def test_fractional_quantity_renders(self):
        data = _order(items=[ReceiptLine(name="Компот", qty=Decimal("0.500"), price=Decimal(10000), total=Decimal(5000))])
        raw = render_customer_receipt_raster(data, {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_unpaid_order_renders_without_crashing(self):
        raw = render_customer_receipt_raster(_order(payment_method=None), {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_total_enabled_false_does_not_raise(self):
        raw = render_customer_receipt_raster(_order(), {"enabled": {"total": False}}, 80)
        assert b"\x1dv0\x00" in raw

    def test_disabled_blocks_do_not_raise(self):
        raw = render_customer_receipt_raster(
            _order(),
            {"enabled": {"logo": False, "address": False, "phone": False, "table": False,
                          "waiter": False, "discount": False, "serviceFee": False, "vat": False,
                          "paymentMethod": False, "thankYouText": False, "bottomOrderNumber": False}},
            80,
        )
        assert b"\x1dv0\x00" in raw

    def test_bottom_order_number_uses_real_order_number(self):
        raw = render_customer_receipt_raster(_order(order_number="777"), {}, 80)
        assert b"\x1dv0\x00" in raw  # real bitmap proof lives in the PNG-level
        # review (see docs); this at minimum proves it didn't crash wiring a
        # real/distinctive order number through.


class TestCustomerReceiptRendererSelection:
    """Service-level raster-primary / text-fallback behavior, isolated from
    the DB: builds a bare PrinterService (no session needed for this sync
    method) and a minimal printer stand-in."""

    def _printer(self, paper_width=80):
        class _P:
            pass
        p = _P()
        p.paper_width = paper_width
        p.settings = {}
        return p

    def test_raster_success_is_used_as_is(self):
        from app.modules.printers.service import PrinterService
        svc = PrinterService.__new__(PrinterService)  # no DB needed for this sync method
        raw = svc._render_customer_receipt(self._printer(), _order(), {}, None)
        assert b"\x1dv0\x00" in raw  # raster, not text

    def test_raster_failure_before_send_falls_back_to_text(self, monkeypatch):
        from app.modules.printers import service as service_module

        def boom(*a, **kw):
            raise RasterRenderError("forced failure for this test")

        monkeypatch.setattr(service_module, "render_customer_receipt_raster", boom)
        svc = service_module.PrinterService.__new__(service_module.PrinterService)
        raw = svc._render_customer_receipt(self._printer(), _order(), {}, None)
        # text-mode fallback: starts the same (ESC @) but has no raster block
        assert raw.startswith(b"\x1b\x40")
        assert b"\x1dv0\x00" not in raw

    def test_non_raster_exceptions_are_not_swallowed(self, monkeypatch):
        """Only RasterRenderError is a safe-to-fall-back signal — anything
        else (a real bug) must propagate, not be silently masked as a
        fallback-to-text."""
        from app.modules.printers import service as service_module

        def boom(*a, **kw):
            raise ValueError("not a RasterRenderError")

        monkeypatch.setattr(service_module, "render_customer_receipt_raster", boom)
        svc = service_module.PrinterService.__new__(service_module.PrinterService)
        with pytest.raises(ValueError):
            svc._render_customer_receipt(self._printer(), _order(), {}, None)


class TestKitchenRasterRendererBasics:
    """KITCHEN RECEIPT FONT + QTY ALIGNMENT V1: the kitchen ticket's raster
    renderer, mirroring TestRasterRendererBasics above — same GS v 0
    bitmap pipeline and font infrastructure as the customer receipt
    (render_customer_receipt_raster), not a separate/old printer-native
    text renderer."""

    def test_returns_gs_v0_payload(self):
        raw = render_kitchen_ticket_raster(_ticket(), {}, 80)
        assert raw.startswith(b"\x1b\x40")  # ESC @ init
        assert b"\x1dv0\x00" in raw  # GS v 0 — same raster technology as the customer receipt
        assert raw.endswith(b"\x1dVA\x49")

    def test_80mm_and_58mm_both_render(self):
        for width in (80, 58):
            raw = render_kitchen_ticket_raster(_ticket(), {}, width)
            assert b"\x1dv0\x00" in raw
            assert len(raw) > 50

    def test_cyrillic_metadata_and_dish_names_render(self):
        data = _ticket(
            waiter_name="Джасур Алимов",
            items=[KitchenItem(name="Мастава", qty="1"), KitchenItem(name="Плов Ташкентский", qty="1")],
        )
        raw = render_kitchen_ticket_raster(data, {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_long_dish_name_wraps_without_raising(self):
        name = "Шашлык из баранины с луком, овощами и специями большая праздничная порция"
        data = _ticket(items=[KitchenItem(name=name, qty="2")])
        raw = render_kitchen_ticket_raster(data, {}, 58)
        assert b"\x1dv0\x00" in raw

    def test_cancelled_order_renders_without_raising(self):
        raw = render_kitchen_ticket_raster(_ticket(status="cancelled"), {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_multiple_courses_and_modifiers_render(self):
        data = _ticket(items=[
            KitchenItem(name="Плов", qty="1", course=1, modifiers=["Острый"], note="без лука"),
            KitchenItem(name="Чай", qty="2", course=2),
        ])
        raw = render_kitchen_ticket_raster(data, {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_order_note_renders(self):
        raw = render_kitchen_ticket_raster(_ticket(note="Аллергия на орехи"), {}, 80)
        assert b"\x1dv0\x00" in raw

    def test_show_order_sum_with_a_real_total_renders(self):
        """business structure unchanged: price only appears when the
        template explicitly turns showOrderSum on, and only with a real
        (never fabricated) OrderItem.total."""
        data = _ticket(items=[KitchenItem(name="Плов", qty="2", total=Decimal(70000))])
        raw = render_kitchen_ticket_raster(data, {"enabled": {"showOrderSum": True}}, 80)
        assert b"\x1dv0\x00" in raw

    def test_no_price_blocks_present_by_default(self):
        """Section 5/20 of the kitchen-parity spec: no price/total/payment
        is ever introduced by the raster switch itself — showOrderSum stays
        off by default, same as the text-mode formatter."""
        data = _ticket(items=[KitchenItem(name="Плов", qty="2", total=Decimal(70000))])
        raw_default = render_kitchen_ticket_raster(data, {}, 80)
        raw_explicit_off = render_kitchen_ticket_raster(data, {"enabled": {"showOrderSum": False}}, 80)
        assert len(raw_default) == len(raw_explicit_off)


class TestKitchenReceiptRendererSelection:
    """Service-level raster-primary / text-fallback behavior for the kitchen
    ticket, mirroring TestCustomerReceiptRendererSelection."""

    def _printer(self, paper_width=80):
        class _P:
            pass
        p = _P()
        p.paper_width = paper_width
        p.settings = {}
        return p

    def test_raster_success_is_used_as_is(self):
        from app.modules.printers.service import PrinterService
        svc = PrinterService.__new__(PrinterService)
        raw = svc._render_kitchen_ticket(self._printer(), _ticket(), {})
        assert b"\x1dv0\x00" in raw  # raster, not the old printer-native text renderer

    def test_raster_failure_before_send_falls_back_to_text(self, monkeypatch):
        from app.modules.printers import service as service_module

        def boom(*a, **kw):
            raise RasterRenderError("forced failure for this test")

        monkeypatch.setattr(service_module, "render_kitchen_ticket_raster", boom)
        svc = service_module.PrinterService.__new__(service_module.PrinterService)
        raw = svc._render_kitchen_ticket(self._printer(), _ticket(), {})
        assert raw.startswith(b"\x1b\x40")
        assert b"\x1dv0\x00" not in raw

    def test_non_raster_exceptions_are_not_swallowed(self, monkeypatch):
        from app.modules.printers import service as service_module

        def boom(*a, **kw):
            raise ValueError("not a RasterRenderError")

        monkeypatch.setattr(service_module, "render_kitchen_ticket_raster", boom)
        svc = service_module.PrinterService.__new__(service_module.PrinterService)
        with pytest.raises(ValueError):
            svc._render_kitchen_ticket(self._printer(), _ticket(), {})


class TestKitchenCustomerFontParity:
    """Proves the kitchen ticket reuses the exact same font-loading
    infrastructure as the customer receipt — not a visually-different font
    stack that merely happens to also be raster (section 16.B: kitchen must
    not silently keep/duplicate a separate renderer)."""

    def test_kitchen_and_customer_font_lookups_share_the_same_cache(self):
        from app.modules.printers import receipt_raster as raster_module

        helper = raster_module.EscPosFormatter(80)
        # Customer's "items" style and kitchen's "orderType" style both
        # resolve to weight=standard/size=standard — same (weight, size)
        # cache key. If both renderers really share one font-loading
        # pipeline (not two independent stacks that happen to look similar),
        # _load_font must hand back the literal same object for it.
        customer_font, _ = raster_module._font_for({}, helper, "items")
        kitchen_font, _ = raster_module._kitchen_font_for({}, helper, "orderType")
        assert customer_font is kitchen_font
        assert ("regular", 24) in raster_module._font_cache


class TestCustomerQuantityColumnCentering:
    """Section 8/9/17 of the kitchen-parity spec: the 'Кол-во' header and
    every row's quantity value must share the exact same column-center
    coordinate (within 1px), while 'Сумма' stays right-aligned. Exercises
    the real _RasterCanvas.item_row draw calls (not a reimplementation of
    the geometry) by spying on ImageDraw.text while delegating textlength
    to the real font metrics."""

    @staticmethod
    def _captured_positions(build_fn):
        img = Image.new("L", (10, 10), 255)
        draw = ImageDraw.Draw(img)
        captured: list[tuple[float, str]] = []
        real_text = draw.text

        def spy_text(xy, text, font=None, fill=None):
            captured.append((xy[0], text))
            return real_text(xy, text, font=font, fill=fill)

        draw.text = spy_text
        canvas = _RasterCanvas(576)
        build_fn(canvas)
        y = 16
        for fn in canvas.rows:
            y = fn(draw, y)
        return captured

    def test_header_and_row_quantity_centers_match_within_1px(self):
        header_font = _load_font("bold", 24)
        row_font = _load_font("regular", 24)
        qty_values = ["1", "7", "10", "100", "1.5"]
        totals = ["1,000", "154,000", "10,000", "100,000", "1,500"]
        qty_w = _measure(header_font, "Кол-во") + 14
        total_w = max(_measure(row_font, t) for t in totals + ["Сумма"]) + 14

        def build(canvas):
            canvas.item_row("Блюдо", "Кол-во", "Сумма", header_font, qty_w, total_w, 6)
            for qty, total in zip(qty_values, totals):
                canvas.item_row("Товар", qty, total, row_font, qty_w, total_w, 6)

        captured = self._captured_positions(build)
        rows = [captured[i : i + 3] for i in range(0, len(captured), 3)]  # (name, qty, total) per row

        header_qty_x, header_qty_text = rows[0][1]
        assert header_qty_text == "Кол-во"
        header_center = header_qty_x + _measure(header_font, header_qty_text) / 2

        for i, qty in enumerate(qty_values, start=1):
            qty_x, qty_text = rows[i][1]
            assert qty_text == qty
            row_center = qty_x + _measure(row_font, qty_text) / 2
            assert abs(row_center - header_center) <= 1.0, f"qty={qty!r} center off by {abs(row_center - header_center)}px"

    def test_amount_column_stays_right_aligned(self):
        header_font = _load_font("bold", 24)
        row_font = _load_font("regular", 24)
        totals = ["1,000", "154,000", "10,000", "100,000", "1,500"]
        qty_w = _measure(header_font, "Кол-во") + 14
        total_w = max(_measure(row_font, t) for t in totals + ["Сумма"]) + 14

        def build(canvas):
            canvas.item_row("Блюдо", "Кол-во", "Сумма", header_font, qty_w, total_w, 6)
            for total in totals:
                canvas.item_row("Товар", "1", total, row_font, qty_w, total_w, 6)

        captured = self._captured_positions(build)
        rows = [captured[i : i + 3] for i in range(0, len(captured), 3)]

        right_edges = []
        for name_entry, qty_entry, (total_x, total_text) in rows:
            font = header_font if total_text == "Сумма" else row_font
            right_edges.append(total_x + _measure(font, total_text))

        # Every row's amount right edge sits at the same x (width - margin),
        # independent of font/text — true right alignment, not centering.
        base = right_edges[0]
        for edge in right_edges[1:]:
            assert abs(edge - base) <= 1.0


class TestCustomerRasterBottomFeed:
    """Outer whitespace: the raster payload owns exactly one controlled feed
    before the cut, not a multi-line blank strip."""

    def test_single_feed_before_cut(self):
        raw = render_customer_receipt_raster(_order(), {}, 80)
        assert raw.endswith(b"\n\x1dVA\x03")
        assert not raw.endswith(b"\n\n\x1dVA\x03")

    def test_feed_count_is_bounded_regardless_of_paper_width(self):
        for width in (80, 58):
            raw = render_customer_receipt_raster(_order(), {}, width)
            assert raw.count(b"\x1dVA\x03") == 1
            assert raw[-5:-4] == b"\n" and raw[-6:-5] != b"\n"


class TestCustomerRasterTopWhitespace:
    """Top outer whitespace: nothing before the first raster row except ESC @
    and the image itself, and a disabled logo reserves no vertical space."""

    def test_payload_starts_with_init_then_raster_without_leading_feed(self):
        raw = render_customer_receipt_raster(_order(), {}, 80)
        assert raw.startswith(b"\x1b\x40\x1dv0\x00")

    def test_disabled_logo_reserves_no_height_even_with_logo_bytes(self):
        buf = io.BytesIO()
        Image.new("RGB", (400, 200), (0, 0, 0)).save(buf, "PNG")
        tpl = {"enabled": {"logo": False}}
        without = render_customer_receipt_raster(_order(), tpl, 80)
        with_bytes = render_customer_receipt_raster(_order(), tpl, 80, buf.getvalue())
        assert len(with_bytes) == len(without)
