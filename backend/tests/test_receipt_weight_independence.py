"""Size must never override the selected customer/kitchen font weight."""
import pytest
from unittest.mock import patch

from app.modules.printers.formatter import EscPosFormatter
from app.modules.printers.receipt_raster import _font_for, _kitchen_font_for


@pytest.mark.parametrize("size", ["standard", "large", "xlarge"])
@pytest.mark.parametrize("weight", ["standard", "bold"])
def test_text_weight_is_independent_of_size(size, weight):
    formatter = EscPosFormatter()
    prefix, suffix, divisor = formatter._style_bytes({"size": size, "weight": weight})
    assert (formatter.BOLD_ON in prefix) == (weight == "bold")
    assert (formatter.BOLD_OFF in suffix) == (weight == "bold")
    assert divisor == 1


@pytest.mark.parametrize("lookup", [_font_for, _kitchen_font_for])
@pytest.mark.parametrize("size,points", [("standard", 24), ("large", 32), ("xlarge", 38)])
@pytest.mark.parametrize("weight", ["standard", "bold"])
def test_raster_weight_is_independent_of_size(lookup, size, points, weight):
    template = {"blockStyles": {"orderNumber": {"size": size, "weight": weight}}}
    with patch("app.modules.printers.receipt_raster._load_font") as load_font:
        lookup(template, EscPosFormatter(), "orderNumber")
    load_font.assert_called_once_with("bold" if weight == "bold" else "regular", points)
