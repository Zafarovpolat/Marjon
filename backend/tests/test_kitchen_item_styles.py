from decimal import Decimal
from unittest.mock import patch

import pytest

from app.modules.printers.formatter import EscPosFormatter, KitchenItem
from app.modules.printers.receipt_raster import _RasterCanvas, _kitchen_font_for, render_kitchen_ticket_raster
from tests.test_kitchen_ticket_sums import _ticket


@pytest.mark.parametrize("size,pixels", [("standard", 24), ("large", 32), ("xlarge", 38)])
@pytest.mark.parametrize("weight", ["standard", "bold"])
def test_kitchen_item_font_honors_size_and_weight(size, pixels, weight):
    template = {"blockStyles": {"dishItems": {"size": size, "weight": weight}}}
    with patch("app.modules.printers.receipt_raster._load_font") as load:
        _kitchen_font_for(template, EscPosFormatter(), "dishItems")
    load.assert_called_once_with("bold" if weight == "bold" else "regular", pixels)


@pytest.mark.parametrize("weight", ["standard", "bold"])
def test_text_ticket_applies_item_style_and_keeps_notes_separate(weight):
    fmt = EscPosFormatter()
    style = {"size": "xlarge", "weight": weight}
    template = {"blockStyles": {"dishItems": style}, "enabled": {"showOrderSum": True}}
    with patch.object(EscPosFormatter, "_kitchen_item_row", return_value=b"DISH_ROW") as row:
        raw = fmt.format_kitchen_ticket(_ticket(), template)
    prefix, suffix, _ = fmt._style_bytes(style)
    assert prefix + b"DISH_ROW" + suffix in raw
    assert all(call.kwargs["bold"] is False for call in row.call_args_list)
    assert "Без казы" in raw.decode("cp866")


@pytest.mark.parametrize("width", [58, 80])
@pytest.mark.parametrize("sums", [False, True])
def test_large_kitchen_items_render_without_dropping_content(width, sums):
    template = {"blockStyles": {"dishItems": {"size": "xlarge", "weight": "standard"}}, "enabled": {"showOrderSum": sums}}
    assert render_kitchen_ticket_raster(_ticket(), template, width)


def test_narrow_large_money_table_keeps_dish_names_full_width():
    template = {"blockStyles": {"dishItems": {"size": "xlarge", "weight": "bold"}}, "enabled": {"showOrderSum": True}}
    with patch.object(_RasterCanvas, "line_of_text", autospec=True) as lines, patch.object(_RasterCanvas, "item_row", autospec=True) as rows:
        render_kitchen_ticket_raster(_ticket(), template, 58)
    texts = [call.args[1] for call in lines.call_args_list]
    assert "Плов чайханский" in texts
    assert "Салат Ачичук" in texts
    assert all(call.args[1] == "" for call in rows.call_args_list)
    assert rows.call_args_list[1].args[2:4] == ("2", "50,000")


@pytest.mark.parametrize("width", [58, 80])
@pytest.mark.parametrize("sums", [False, True])
def test_raster_prints_table_header_and_centered_quantity_column(width, sums):
    with patch.object(_RasterCanvas, "item_row", autospec=True) as row, patch.object(_RasterCanvas, "text_row", autospec=True) as text:
        render_kitchen_ticket_raster(_ticket(), {"enabled": {"showOrderSum": sums}}, width)
    header, *items = row.call_args_list
    assert header.args[1:4] == ("Блюдо", "Кол-во", "Сумма" if sums else "")
    assert len(items) == 2
    for call in items:
        assert call.args[5:7] == header.args[5:7]  # same column widths/centers
    assert items[0].args[1:4] == ("Плов чайханский", "2", "50,000" if sums else "")
    totals = [call for call in text.call_args_list if call.args[1] == "Сумма блюд"]
    assert len(totals) == int(sums)
    if sums:
        assert totals[0].args[2] == "65,000"


@pytest.mark.parametrize("size,pixels", [("standard", 24), ("large", 32), ("xlarge", 38)])
@pytest.mark.parametrize("weight", ["standard", "bold"])
def test_raster_sum_and_order_comment_use_their_own_font(size, pixels, weight):
    style = {"size": size, "weight": weight}
    template = {"enabled": {"showOrderSum": True}, "blockStyles": {"showOrderSum": style, "comment": style}}
    with patch.object(_RasterCanvas, "text_row", autospec=True) as rows, patch.object(_RasterCanvas, "line_of_text", autospec=True) as lines:
        render_kitchen_ticket_raster(_ticket(note="Без лука"), template, 80)
    expected, _ = _kitchen_font_for(template, EscPosFormatter(), "comment")
    total = next(call for call in rows.call_args_list if call.args[1] == "Сумма блюд")
    assert total.args[3] is expected
    assert expected.size == pixels
    comment = [call for call in lines.call_args_list if call.args[1] in ("Комментарий:", "- Без лука")]
    assert len(comment) == 2
    assert all(call.args[2] is expected for call in comment)
    modifier = next(call for call in lines.call_args_list if "Без казы" in call.args[1])
    assert modifier.args[2].size == 24  # independent of the order-comment style


@pytest.mark.parametrize("width", [58, 80])
def test_money_setting_does_not_invent_amounts_for_priceless_items(width):
    data = _ticket(items=[KitchenItem(name="Плов", qty="2", total=None)])
    template = {"enabled": {"showOrderSum": True}}
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows, patch.object(_RasterCanvas, "text_row", autospec=True) as text:
        render_kitchen_ticket_raster(data, template, width)
    assert rows.call_args_list[0].args[3] == ""
    assert not any(call.args[1] == "Сумма блюд" for call in text.call_args_list)
    raw = EscPosFormatter(width).format_kitchen_ticket(data, template).decode("cp866")
    assert "Сумма" not in raw


def test_unknown_item_total_stays_blank_but_known_amount_is_in_subtotal():
    data = _ticket(items=[KitchenItem(name="Плов", qty="2", total=None), KitchenItem(name="Чай", qty="1", total=Decimal(5000))])
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows, patch.object(_RasterCanvas, "text_row", autospec=True) as text:
        render_kitchen_ticket_raster(data, {"enabled": {"showOrderSum": True}}, 58)
    assert rows.call_args_list[1].args[3] == ""
    total = next(call for call in text.call_args_list if call.args[1] == "Сумма блюд")
    assert total.args[2] == "5,000"


@pytest.mark.parametrize("enabled", [{"comment": False}, {"itemComments": False, "orderNote": False, "createdAt": False}])
def test_disabled_comments_and_legacy_gates_stay_disabled(enabled):
    data = _ticket(note="Order note", items=[KitchenItem(name="Плов", qty="2", note="Item note", modifiers=["Modifier"])])
    with patch.object(_RasterCanvas, "line_of_text", autospec=True) as lines, patch.object(_RasterCanvas, "text_row", autospec=True) as rows:
        render_kitchen_ticket_raster(data, {"enabled": enabled}, 80)
    text = " ".join(call.args[1] for call in lines.call_args_list)
    assert "Order note" not in text
    assert "Item note" not in text
    assert "Modifier" in text
    if enabled.get("createdAt") is False:
        assert not any(call.args[1] == "Время:" for call in rows.call_args_list)
