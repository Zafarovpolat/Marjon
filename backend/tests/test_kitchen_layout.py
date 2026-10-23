from decimal import Decimal
from unittest.mock import patch

import pytest

from app.modules.printers.formatter import EscPosFormatter, KitchenItem, format_kitchen_order_type
from app.modules.printers.receipt_raster import _RasterCanvas, render_kitchen_ticket_raster
from tests.test_kitchen_ticket_sums import _ticket


@pytest.mark.parametrize("order_type,label", [
    ("dine_in", "На стол"), ("takeaway", "С собой"), ("delivery", "Доставка"),
    ("На вынос", "С собой"), ("Самовывоз", "Самовывоз"),
])
def test_type_is_a_standalone_heading_above_number_in_old_templates(order_type, label):
    data = _ticket(order_type=order_type)
    template = {"blocks": ["table", "orderNumber", "orderType", "waiter"]}
    assert format_kitchen_order_type(order_type) == label
    raw = EscPosFormatter(80).format_kitchen_ticket(data, template).decode("cp866")
    assert "Тип заказа:" not in raw and "На вынос" not in raw
    assert raw.index(label) < raw.index("#A-1042")
    with patch.object(_RasterCanvas, "line_of_text", autospec=True) as lines:
        render_kitchen_ticket_raster(data, template, 80)
    texts = [call.args[1] for call in lines.call_args_list]
    assert texts.index(label) < texts.index("#A-1042")


@pytest.mark.parametrize("show", [False, True])
def test_amount_switch_only_adds_column_and_never_a_subtotal(show):
    data = _ticket()
    template = {"enabled": {"showOrderSum": show}}
    raw = EscPosFormatter(80).format_kitchen_ticket(data, template).decode("cp866")
    assert ("Сумма" in raw) == show
    assert ("50,000" in raw) == show
    assert "65,000" not in raw and "Сумма блюд" not in raw
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows, \
         patch.object(_RasterCanvas, "text_row", autospec=True) as infos:
        render_kitchen_ticket_raster(data, template, 80)
    assert rows.call_args_list[0].args[3] == ("Сумма" if show else "")
    assert not any("Сумма блюд" in str(call) for call in infos.call_args_list)


def test_amount_column_still_exists_for_free_or_unknown_items():
    items = [KitchenItem("Бесплатно", "1", total=Decimal(0)), KitchenItem("Неизвестно", "1")]
    template = {"enabled": {"showOrderSum": True}}
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows:
        render_kitchen_ticket_raster(_ticket(items=items), template, 80)
    assert rows.call_args_list[0].args[3] == "Сумма"
    assert rows.call_args_list[1].args[3] == "0"
    assert rows.call_args_list[2].args[3] == ""


@pytest.mark.parametrize("size,pixels", [("standard", 24), ("large", 32), ("xlarge", 38)])
def test_table_head_remains_compact_when_dishes_are_enlarged(size, pixels):
    template = {"enabled": {"showOrderSum": True}, "blockStyles": {"dishItems": {"size": size}}}
    with patch.object(_RasterCanvas, "item_row", autospec=True) as rows:
        render_kitchen_ticket_raster(_ticket(), template, 80)
    assert rows.call_args_list[0].args[4].size == 24
    assert all(call.args[4].size == pixels for call in rows.call_args_list[1:])


def test_spacing_changes_paper_height_without_changing_text_or_size():
    images = []
    original = _RasterCanvas.render
    for spacing in ("small", "medium", "large"):
        def capture(canvas):
            img = original(canvas)
            images.append(img)
            return img
        with patch.object(_RasterCanvas, "render", capture):
            render_kitchen_ticket_raster(_ticket(), {"lineSpacing": spacing}, 80)
        raw = EscPosFormatter(80).format_kitchen_ticket(_ticket(), {"lineSpacing": spacing})
        assert EscPosFormatter._LINE_SPACING_CODES[spacing] in raw
    assert images[0].height < images[1].height < images[2].height
    assert all(img.width == 576 for img in images)


@pytest.mark.parametrize("note", [None, "Соус отдельно"])
@pytest.mark.parametrize("show_sum", [False, True])
def test_kitchen_cuts_without_extra_blank_lines_or_bottom_image_margin(note, show_sum):
    from PIL import ImageOps
    from app.modules.printers import receipt_raster

    data = _ticket(note=note)
    template = {"enabled": {"showOrderSum": show_sum}}
    with patch.object(receipt_raster, "_to_gs_v0", wraps=receipt_raster._to_gs_v0) as encode:
        raw = render_kitchen_ticket_raster(data, template, 80)
    image = encode.call_args.args[0]
    ink_bounds = ImageOps.invert(image.convert("L")).getbbox()
    assert ink_bounds[1] == 0
    assert image.height - ink_bounds[3] == 4
    # ESC @ (2) + GS v 0 header (8) + exactly width_bytes * height bitmap bytes.
    assert raw[2:6] == b"\x1dv0\x00"
    width_bytes = int.from_bytes(raw[6:8], "little")
    height = int.from_bytes(raw[8:10], "little")
    footer = EscPosFormatter.KITCHEN_CUT
    assert footer == b"\x1dVA\x49"
    assert footer[-1] - EscPosFormatter.CUT[-1] == 70
    assert raw[10 + width_bytes * height:] == footer
    fallback = EscPosFormatter(80).format_kitchen_ticket(data, template)
    assert fallback.endswith(b"\n" + footer)
    assert not fallback.endswith(b"\n\n" + footer)


@pytest.mark.parametrize("show_type", [False, True])
@pytest.mark.parametrize("spacing", ["small", "medium", "large"])
def test_top_trim_removes_only_blank_rows_and_preserves_all_printed_pixels(show_type, spacing):
    from PIL import ImageChops, ImageOps
    from app.modules.printers import receipt_raster

    full_images = []
    original_render = _RasterCanvas.render

    def capture(canvas):
        image = original_render(canvas)
        full_images.append(image)
        return image

    with patch.object(_RasterCanvas, "render", capture), \
         patch.object(receipt_raster, "_to_gs_v0", wraps=receipt_raster._to_gs_v0) as encode:
        render_kitchen_ticket_raster(_ticket(), {
            "enabled": {"orderType": show_type}, "lineSpacing": spacing,
        }, 80)
    original = full_images[0].convert("1")
    trimmed = encode.call_args.args[0]
    bounds = ImageOps.invert(original.convert("L")).getbbox()
    expected = original.crop((0, bounds[1], original.width, bounds[3] + 4))
    assert ImageChops.difference(expected.convert("L"), trimmed.convert("L")).getbbox() is None
    assert trimmed.width == original.width
    assert trimmed.height < original.height


@pytest.mark.parametrize("timestamp,expected", [
    ("2026-10-23T17:10:00+00:00", "23.10.26 22:10"),
    ("2026-10-23T17:10:00", "23.10.26 22:10"),
    ("2026-10-23T22:10:00+00:00", "24.10.26 03:10"),
    ("2026-10-23T22:10:00+05:00", "23.10.26 22:10"),
])
async def test_kitchen_time_is_the_order_creation_time_in_tashkent(timestamp, expected):
    from datetime import datetime, timedelta
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from uuid import uuid4
    from app.modules.printers.service import PrinterService

    service = PrinterService.__new__(PrinterService)
    service._resolve_waiter_name = AsyncMock(return_value="Азиз")
    service._resolve_staff_label = AsyncMock(return_value="Кассир")
    order = SimpleNamespace(order_number="41", order_type="dine_in", table_number="1",
                            items=[], note=None, status="new", created_at=datetime.fromisoformat(timestamp))
    company_id = uuid4()
    data = await service._build_kitchen_data(company_id, order)
    reprint = await service._build_kitchen_data(company_id, order)
    assert data.printed_at.utcoffset() == timedelta(hours=5)
    assert data.printed_at.strftime("%d.%m.%y %H:%M") == expected
    assert reprint.printed_at == data.printed_at
    raw = EscPosFormatter(80).format_kitchen_ticket(data, {}).decode("cp866")
    assert expected in raw
    with patch.object(_RasterCanvas, "text_row", autospec=True) as rows:
        render_kitchen_ticket_raster(data, {}, 80)
    assert any(call.args[1:3] == ("Время:", expected) for call in rows.call_args_list)
