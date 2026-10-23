from dataclasses import replace
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.modules.printers.formatter import EscPosFormatter, KitchenItem, ReceiptLine
from app.modules.printers.receipt_layout import grouped_items
from app.modules.printers.receipt_raster import (
    _RasterCanvas, _font_for, render_customer_receipt_raster, render_kitchen_ticket_raster,
)
from tests.test_receipt_block_styles import _receipt
from tests.test_kitchen_ticket_sums import _ticket


@pytest.mark.parametrize("kitchen", [False, True])
def test_three_identical_lines_become_one_without_mutating_order(kitchen):
    item = KitchenItem("Хот дог", "1", total=Decimal(14000), product_id="hotdog") if kitchen else ReceiptLine("Хот дог", Decimal(1), Decimal(14000), Decimal(14000), product_id="hotdog")
    original = [replace(item) for _ in range(3)]
    grouped = grouped_items(original)
    assert len(grouped) == 1
    assert Decimal(str(grouped[0].qty)) == 3
    assert grouped[0].total == 42000
    assert all(Decimal(str(row.qty)) == 1 and row.total == 14000 for row in original)
    data = _ticket(items=original) if kitchen else _receipt(items=original)
    raster = render_kitchen_ticket_raster if kitchen else render_customer_receipt_raster
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows:
        assert raster(data, {"enabled": {"showOrderSum": True}}, 80)
    dishes = [call for call in rows.call_args_list if call.args[1] == "Хот дог"]
    assert len(dishes) == 1
    assert dishes[0].args[2:4] == ("3", "42,000")
    text = (EscPosFormatter(80).format_kitchen_ticket(data) if kitchen else EscPosFormatter(80).format_receipt(data)).decode("cp866")
    assert text.count("Хот дог") == 1


@pytest.mark.parametrize("change", [
    {"note": "Без лука"}, {"modifiers": ["Сыр"]}, {"course": 2},
    {"product_id": "other"}, {"total": Decimal(15000)}, {"takeaway": True},
])
def test_different_kitchen_variants_stay_separate(change):
    item = KitchenItem("Хот дог", "1", total=Decimal(14000), product_id="hotdog")
    assert len(grouped_items([item, replace(item, **change)])) == 2


def test_fractional_quantities_and_unknown_amounts_are_preserved():
    item = KitchenItem("Чай", "0.25", total=None)
    row = grouped_items([item, replace(item)])[0]
    assert row.qty == "0.5" and row.total is None


@pytest.mark.parametrize("kitchen", [False, True])
def test_short_date_and_staff_label_reach_both_renderers(kitchen):
    data = (_ticket() if kitchen else _receipt())
    data = replace(data, staff_label="Кассир", waiter_name="Азиз", printed_at=datetime(2026, 10, 23, 17, 40))
    fmt = EscPosFormatter(80)
    raw = (fmt.format_kitchen_ticket(data) if kitchen else fmt.format_receipt(data)).decode("cp866")
    assert "Кассир:" in raw and "Азиз" in raw
    assert "Официант:" not in raw
    assert "23.10.26 17:40" in raw and "23.10.2026" not in raw
    with patch.object(_RasterCanvas, "text_row", autospec=True) as rows:
        (render_kitchen_ticket_raster if kitchen else render_customer_receipt_raster)(data, {}, 80)
    assert any(call.args[1:3] == ("Кассир:", "Азиз") for call in rows.call_args_list)
    assert any(call.args[2] == "23.10.26 17:40" for call in rows.call_args_list)


@pytest.mark.parametrize("size,pixels", [("standard", 24), ("large", 32), ("xlarge", 38)])
@pytest.mark.parametrize("kitchen", [False, True])
def test_header_font_tracks_dish_font(size, pixels, kitchen):
    template = {"blockStyles": {"dishItems" if kitchen else "items": {"size": size, "weight": "standard"}}}
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows:
        (render_kitchen_ticket_raster if kitchen else render_customer_receipt_raster)(_ticket() if kitchen else _receipt(), template, 80)
    header = next(call for call in rows.call_args_list if call.args[2] == "Кол-во")
    assert header.args[4].size == (24 if kitchen else pixels)
    assert all(call.args[4].size == pixels for call in rows.call_args_list if call != header)


@pytest.mark.parametrize("block,size,pixels", [
    ("restaurantName", "standard", 32), ("restaurantName", "large", 48), ("restaurantName", "xlarge", 80),
    ("bottomOrderNumber", "standard", 48), ("bottomOrderNumber", "large", 96), ("bottomOrderNumber", "xlarge", 180),
])
def test_prominent_blocks_have_independent_large_fonts(block, size, pixels):
    with patch("app.modules.printers.receipt_raster._load_font") as load:
        _font_for({"blockStyles": {block: {"size": size, "weight": "standard"}}}, EscPosFormatter(), block)
    load.assert_called_once_with("regular", pixels)


@pytest.mark.parametrize("pattern", ["dashed", "solid", "stars"])
@pytest.mark.parametrize("weight", ["thin", "medium", "bold"])
def test_separator_styles_are_applied_to_raster_and_native_fallback(pattern, weight):
    template = {"separator": {"pattern": pattern, "weight": weight}}
    with patch.object(_RasterCanvas, "render", autospec=True, wraps=None) as render:
        from PIL import Image
        render.return_value = Image.new("L", (576, 40), 255)
        render_customer_receipt_raster(_receipt(), template, 80)
        assert render.call_args.args[0].separator == (pattern, weight)
    text = EscPosFormatter(80).format_receipt(_receipt(), template).decode("cp866")
    char = {"dashed": "-", "solid": "_", "stars": "*"}[pattern]
    assert char * 48 in text


def test_all_nine_raster_rules_have_distinct_ink():
    images = set()
    for pattern in ("dashed", "solid", "stars"):
        for weight in ("thin", "medium", "bold"):
            canvas = _RasterCanvas(576, (pattern, weight))
            canvas.divider()
            image = canvas.render()
            images.add((image.size, image.tobytes()))
    assert len(images) == 9


def test_short_total_and_service_labels_preserve_amounts():
    data = _receipt(service_fee=Decimal(12000), service_fee_rate=Decimal(12))
    raw = EscPosFormatter(80).format_receipt(data).decode("cp866")
    assert "Обслуга 12%" in raw and "12,000" in raw
    assert "Итого:" in raw and "Итого к оплате" not in raw
    with patch.object(_RasterCanvas, "text_row", autospec=True) as rows:
        render_customer_receipt_raster(data, {}, 80)
    assert any(call.args[1] == "Обслуга 12%" and call.args[2] == "12,000" for call in rows.call_args_list)
    assert any(call.args[1] == "Итого:" for call in rows.call_args_list)
