from unittest.mock import patch

import pytest

from app.modules.printers.formatter import EscPosFormatter
from app.modules.printers.receipt_raster import _kitchen_font_for, render_kitchen_ticket_raster
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
