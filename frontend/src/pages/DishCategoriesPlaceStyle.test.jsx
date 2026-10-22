import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import CategoriesPage, { applyCategoryOrder } from "./CategoriesPage";
import { getCategories } from "../api/categories";
import { catalogService } from "../api/catalog";

vi.mock("../api/categories", () => ({
  getCategories: vi.fn(),
}));
vi.mock("../api/catalog", () => ({
  catalogService: {
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    reorderCategories: vi.fn(),
    uploadCategoryImage: vi.fn(),
  },
}));

// V2 — Dish Categories follow-up: Dishes-like panel, turquoise add button,
// centered Add modal (photo/name/status/service/show-in-menu/add), service as
// a status-like pill, taller rows, no hash secondary text. Real category
// business content only — no fake Place tables/percent/pricing.
describe("Dish Categories V2 follow-up", () => {
  it("renders Place-family rows with service pill, no hash text, and opens the centered Add modal", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [
        { id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true },
        { id: "c2", name: "Архивная", slug: "arh", is_active: false, calculate_service: false, show_in_menu: false },
      ],
    });
    render(<CategoriesPage type="dishes" />);

    expect(screen.getByRole("heading", { name: "Категория блюд" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить категорию" })).toBeInTheDocument();
    // ARCHIVE V1: Active tab shows only active rows; archived live in their tab.
    expect(screen.getByRole("tab", { name: "Активные" })).toHaveClass("is-active");
    expect(await screen.findByText("Супы")).toBeInTheDocument();
    expect(screen.queryByText("Архивная")).toBeNull();
    // V2: hash secondary text removed — no slug line in dish rows.
    expect(screen.queryByText("#supy")).toBeNull();
    expect(screen.queryByText("#arh")).toBeNull();
    expect(screen.queryByText(/#\S/)).toBeNull();
    // V3: active rows share the identical structure/layout (same classes).
    const rows = document.querySelectorAll(".dishcat-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].tagName).toBe("ARTICLE");
    // V5: фото у категорий блюд убрано — порядок
    // (NAME < SERVICE < ACTIVE < EDIT < DELETE), фото-блоков нет вообще.
    expect(document.querySelectorAll(".dishcat-photo-sm")).toHaveLength(0);
    rows.forEach((row) => {
      const html = row.innerHTML;
      const infoPos = html.indexOf("dishcat-info");
      const svcPos = html.indexOf("dishcat-service-badge");
      const statusPos = html.indexOf("settings-status-badge");
      expect(infoPos).toBeGreaterThan(-1);
      expect(svcPos).toBeGreaterThan(infoPos);
      expect(statusPos).toBeGreaterThan(svcPos);
    });
    // V6: service badge renders real backend state (Супы calculate_service=true → is-on).
    const badges = document.querySelectorAll(".dishcat-service-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].classList.contains("is-on")).toBe(true);
    // V2: service is a status-like pill, not an action button.
    expect(screen.getAllByText("Рассчитать обслугу")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Рассчитать обслугу" })).toBeNull();
    // Place-family status language preserved (active row only in this tab).
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(screen.queryByText("Неактивен")).toBeNull();
    // Place-family actions (ARCHIVE V1: active trash archives).
    expect(screen.getAllByRole("button", { name: "Редактировать" })).toHaveLength(1);
    expect(screen.getAllByLabelText("Архивировать категорию")).toHaveLength(1);
    // Archived tab holds the inactive row with Restore + permanent Delete.
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Архивная")).toBeInTheDocument();
    expect(screen.getByText("Неактивен")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Редактировать" })).toBeNull();
    expect(screen.getByRole("button", { name: "Восстановить категорию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить окончательно" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Активные" }));
    expect(await screen.findByText("Супы")).toBeInTheDocument();

    // No fake Place business data.
    expect(screen.queryByText(/стол/)).toBeNull();
    expect(screen.queryByText(/UZS/)).toBeNull();
    // Old image placeholder block stays removed.
    expect(screen.queryByLabelText("Изображение категории")).toBeNull();

    // V4: Edit opens its own centered modal, prefilled with the clicked
    // category's real values. ARCHIVE V1: Active tab lists Супы, so the
    // prefill must reflect THAT row (name + Активен).
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const editDialog = await screen.findByRole("dialog", { name: "Редактировать категорию" });
    expect(editDialog).toBeInTheDocument();
    expect(editDialog.querySelector('input[placeholder="Название категории"]').value).toBe("Супы");
    expect(editDialog).toHaveTextContent("Статус");
    expect(editDialog).toHaveTextContent("Рассчитать обслугу");
    expect(editDialog).toHaveTextContent("Показать в меню");
    expect(editDialog.querySelector('button[type="submit"]').textContent).toBe("Сохранить");
    // Prefilled status reflects the clicked row (Супы is active).
    expect(editDialog).toHaveTextContent("Активен");
    fireEvent.click(editDialog.querySelector(".settings-form__footer button[type='button']"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Редактировать категорию" })).toBeNull());

    // V2: Add opens a centered OWNER modal with the required fields.
    fireEvent.click(screen.getByRole("button", { name: "Добавить категорию" }));
    const dialog = await screen.findByRole("dialog", { name: "Добавить категорию" });
    expect(dialog).toBeInTheDocument();
    // Add modal is blank (not leaking the edit prefill).
    expect(dialog.querySelector('input[placeholder="Название категории"]').value).toBe("");
    expect(dialog).not.toHaveTextContent("Фото");
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog).toHaveTextContent("Название");
    expect(dialog).toHaveTextContent("Статус");
    expect(dialog).toHaveTextContent("Рассчитать обслугу");
    expect(dialog).toHaveTextContent("Показать в меню");
    expect(dialog.querySelector('input[placeholder="Название категории"]')).not.toBeNull();
    const addButton = dialog.querySelector('button[type="submit"]');
    expect(addButton?.textContent).toBe("Добавить");
    const footerButtons = Array.from(dialog.querySelectorAll(".settings-form__footer button"));
    expect(footerButtons.map((b) => b.textContent)).toEqual(["Отмена", "Добавить"]);

    // Modal closes cleanly without creating anything.
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await waitFor(() => expect(getCategories).toHaveBeenCalled());
  });

  it("saves edits through the real update API and refetches, without faking success", async () => {
    const rows = [
      { id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true },
      { id: "c2", name: "Архивная", slug: "arh", is_active: false, calculate_service: false, show_in_menu: false },
    ];
    vi.mocked(getCategories).mockResolvedValue({ data: rows });
    vi.mocked(catalogService.updateCategory).mockResolvedValue({ data: { id: "c1" } });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");

    // V6: flag switches are real and enabled in Edit, prefilled from backend.
    // ARCHIVE V1: Active tab lists Супы — editing targets the active row.
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const dialog = await screen.findByRole("dialog", { name: "Редактировать категорию" });
    const serviceToggle = within(dialog).getByText("Рассчитать обслугу").closest("div").querySelector("input");
    const showToggle = within(dialog).getByText("Показать в меню").closest("div").querySelector("input");
    expect(serviceToggle.disabled).toBe(false);
    expect(showToggle.disabled).toBe(false);
    expect(serviceToggle.checked).toBe(true);
    expect(showToggle.checked).toBe(true);

    fireEvent.change(dialog.querySelector('input[placeholder="Название категории"]'), {
      target: { value: "Супы новые" },
    });
    fireEvent.click(serviceToggle); // true -> false
    vi.mocked(getCategories).mockResolvedValue({
      data: [
        { id: "c1", name: "Супы новые", slug: "supy", is_active: true, calculate_service: false, show_in_menu: true },
        rows[1],
      ],
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(catalogService.updateCategory).toHaveBeenCalledWith("c1", {
        name: "Супы новые",
        is_active: true,
        calculate_service: false,
        show_in_menu: true,
      }),
    );
    // Photo (no new file chosen) never enters the payload.
    const sent = vi.mocked(catalogService.updateCategory).mock.calls[0][1];
    expect(sent).not.toHaveProperty("photo");
    expect(sent).not.toHaveProperty("image_url");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Супы новые")).toBeInTheDocument();
    // Row reflects the persisted OFF state (red family class, Active tab).
    const updated = document.querySelectorAll(".dishcat-service-badge");
    expect(updated[0].classList.contains("is-off")).toBe(true);
  });

  it("keeps the edit modal open with the real backend error on save failure", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true }],
    });
    vi.mocked(catalogService.updateCategory).mockRejectedValue({
      response: { data: { detail: "Имя уже занято" } },
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const dialog = await screen.findByRole("dialog", { name: "Редактировать категорию" });
    fireEvent.change(dialog.querySelector('input[placeholder="Название категории"]'), {
      target: { value: "Дубликат" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(within(dialog).getByText("Имя уже занято")).toBeInTheDocument(),
    );
    // No fake success: modal stays open, list unchanged.
    expect(screen.getByRole("dialog", { name: "Редактировать категорию" })).toBeInTheDocument();
    expect(screen.getByText("Супы")).toBeInTheDocument();
    expect(screen.queryByText("Дубликат")).toBeNull();
  });

  it("archives through the real backend confirm flow and refetches", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true }],
    });
    vi.mocked(catalogService.updateCategory).mockResolvedValue({ data: { id: "c1", is_active: false } });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");

    // ARCHIVE V1: active trash archives (PATCH), never physical DELETE.
    fireEvent.click(screen.getByRole("button", { name: "Архивировать категорию" }));
    const confirm = await screen.findByRole("dialog", { name: "Архивировать категорию?" });
    expect(confirm).toHaveTextContent("будет перемещена в архив");
    vi.mocked(getCategories).mockResolvedValue({ data: [] });
    fireEvent.click(within(confirm).getByRole("button", { name: "Архивировать" }));

    await waitFor(() => expect(catalogService.updateCategory).toHaveBeenCalledWith("c1", { is_active: false }));
    expect(catalogService.deleteCategory).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Супы")).toBeNull();
  });

  it("permanently deletes unreferenced archived categories and refetches", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Старая", slug: "staraya", is_active: false, calculate_service: false, show_in_menu: false }],
    });
    vi.mocked(catalogService.deleteCategory).mockResolvedValue({});
    render(<CategoriesPage type="dishes" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Старая");

    fireEvent.click(screen.getByRole("button", { name: "Удалить окончательно" }));
    const confirm = await screen.findByRole("dialog", { name: "Удалить категорию навсегда?" });
    expect(confirm).toHaveTextContent("без возможности восстановления");
    vi.mocked(getCategories).mockResolvedValue({ data: [] });
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(catalogService.deleteCategory).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Старая")).toBeNull();
  });

  it("keeps the row and shows the backend error when delete is refused", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: false, calculate_service: true, show_in_menu: true }],
    });
    vi.mocked(catalogService.deleteCategory).mockRejectedValue({
      response: { data: { detail: "Category is in use by dishes and cannot be deleted" } },
    });
    render(<CategoriesPage type="dishes" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Супы");

    fireEvent.click(screen.getByRole("button", { name: "Удалить окончательно" }));
    const confirm = await screen.findByRole("dialog", { name: "Удалить категорию навсегда?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));

    await waitFor(() =>
      expect(
        within(confirm).getByText("Category is in use by dishes and cannot be deleted"),
      ).toBeInTheDocument(),
    );
    // No fake removal: confirm stays open, row stays.
    expect(screen.getByRole("dialog", { name: "Удалить категорию навсегда?" })).toBeInTheDocument();
    expect(screen.getByText("Супы")).toBeInTheDocument();
  });

  it("never shows the legacy not-connected delete message", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true }],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    expect(screen.queryByText(/пока не подключено к backend/)).toBeNull();
    // Dish flow no longer references the legacy stub (a non-dish fallback
    // message for other category types is out of scope and stays honest).
    const src = readFileSync(`${process.cwd()}/src/pages/CategoriesPage.jsx`, "utf8");
    expect(src).not.toMatch(/function handleDelete/);
    expect(src).toMatch(/onClick=\{\(\) => openDeleteConfirm\(row\)\}/);
  });

  it("dish categories carry no photo UI and never send image_url", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true, image_url: "http://localhost:9000/marjon-media/categories/a.png" }],
    });
    vi.mocked(catalogService.updateCategory).mockResolvedValue({ data: { id: "c1" } });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    // Ряды без миниатюр и вьюера даже при image_url в ответе.
    expect(document.querySelectorAll(".dishcat-photo-sm")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /фото категории/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const dialog = await screen.findByRole("dialog", { name: "Редактировать категорию" });
    // Модалка без фото-блока и загрузки.
    expect(dialog.querySelector(".dishcat-photo")).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(catalogService.uploadCategoryImage).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(catalogService.updateCategory).toHaveBeenCalled());
    const sent = vi.mocked(catalogService.updateCategory).mock.calls[0][1];
    expect(sent).not.toHaveProperty("image_url");
    expect(sent).not.toHaveProperty("photo");
  });

  it("closes dish form through exit animation, not instantly", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true }],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    fireEvent.click(screen.getByRole("button", { name: "Добавить категорию" }));
    await screen.findByRole("dialog", { name: "Добавить категорию" });
    const overlay = document.querySelector(".dishcat-modal-layer .settings-modal-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveClass("is-closing");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(overlay).toHaveClass("is-closing");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Добавить категорию" })).toBeNull());
  });

  it("shows cached rows instantly on remount without skeleton flash", async () => {
    const row = { id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true };
    vi.mocked(getCategories).mockResolvedValue({ data: [row] });
    const first = render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    first.unmount();
    // Повторный заход: fetch висит, но кэш показывает ряды сразу.
    let resolveFetch;
    vi.mocked(getCategories).mockReturnValue(new Promise((res) => { resolveFetch = res; }));
    render(<CategoriesPage type="dishes" />);
    expect(screen.getByText("Супы")).toBeInTheDocument();
    expect(document.querySelector(".menu-category-row.is-loading")).toBeNull();
    resolveFetch({ data: [row] });
    await screen.findByText("Супы");
  });

  it("settles tabs pill without slide on first paint", async () => {
    vi.mocked(getCategories).mockResolvedValue({ data: [] });
    render(<CategoriesPage type="dishes" />);
    await waitFor(() => expect(
      document.querySelector(".dish-status-tabs.is-settled"),
    ).not.toBeNull());
  });

  it("keeps modal X button proportional (38px circle like dialogs)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    const x = css.match(
      /\.dishcat-modal-layer \.settings-form__header button\[aria-label="Закрыть"\]\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(x).toMatch(/width:\s*38px/);
    expect(x).toMatch(/height:\s*38px/);
    expect(x).toMatch(/border-radius:\s*999px/);
  });

  it("gives service badge a free track (no 40px photo column)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    const meta = css.match(
      /\.menu-categories-page\.is-dish-categories \.dishcat-meta\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(meta).toMatch(/grid-template-columns:\s*auto auto auto 34px/);
    expect(meta).not.toMatch(/40px/);
  });

  it("shifts service + status left of row actions", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    const status = css.match(
      /\.menu-categories-page\.is-dish-categories \.dishcat-meta \.settings-status-badge\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(status).toMatch(/margin-right:\s*24px/);
  });

  it("keeps dish rows photo-free with service pill first in meta", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true }],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    const row = document.querySelector(".dishcat-row");
    const html = row.innerHTML;
    expect(html).not.toContain("dishcat-photo");
    expect(html.indexOf("dishcat-service-badge")).toBeGreaterThan(html.indexOf("dishcat-info"));
  });

  it("uses a smaller scoped title only in the Edit modal", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    const title = css.match(
      /\.dishcat-modal-layer \.dishcat-modal--edit \.settings-form__header h2\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(title).toMatch(/font-size:\s*24px/);
    expect(title).toMatch(/font-weight:\s*700/);
    expect(title).toMatch(/line-height:\s*1\.15/);
  });

  it("keeps destructive rest state flat white with no inherited glow", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    // Неон тянулся из базового turquoise-submit (box-shadow) — гасим явно.
    const rest = css.match(
      /\.dishcat-modal-layer \.settings-form__footer button\.dishcat-confirm__delete\[type="submit"\]\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(rest).toMatch(/background:\s*#(?:fff|FFFFFF)/i);
    expect(rest).toMatch(/box-shadow:\s*none/);
  });

  it("keeps destructive hover soft red with a full-strength selector, no turquoise", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    // V6.8: the short (0,4,0) hover lost to the turquoise submit hover
    // (0,5,1); the winning rule must carry button+class+attr+pseudo.
    const hover = css.match(
      /\.dishcat-modal-layer \.settings-form__footer button\.dishcat-confirm__delete\[type="submit"\]:hover[^{]*\{[^}]*\}/,
    )?.[0] || "";
    expect(hover).toMatch(/background:\s*rgba\(239,\s*68,\s*68,\s*0\.08\)/);
    expect(hover).toMatch(/border-color:\s*#EF4444/i);
    expect(hover).toMatch(/color:\s*#EF4444/i);
    expect(hover).toMatch(/box-shadow:\s*none/);
    expect(hover).toMatch(/transform:\s*none/);
    expect(hover).not.toMatch(/1FC9C9|1AB5B5|0ea5e9/i);
  });

  it("has no photo viewer or photo confirm dialogs anymore", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true, image_url: "http://localhost:9000/marjon-media/categories/a.png" }],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    expect(document.querySelector(".dishcat-viewer-layer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить фото?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    await screen.findByRole("dialog", { name: "Редактировать категорию" });
    expect(screen.queryByRole("dialog", { name: "Удалить фото?" })).toBeNull();
  });

  it("closes raw form through exit animation too", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Овощи", slug: "raw-ovoshi", is_active: true }],
    });
    const { unmount } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Овощи");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByRole("dialog", { name: "Добавить категорию продуктов" });
    const overlay = document.querySelector(".rawcat-modal-layer .settings-modal-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(overlay).toHaveClass("is-closing");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Добавить категорию продуктов" })).toBeNull());
    unmount();
  });

  it("offsets only the МЕНЮ eyebrow by 8px via a category-scoped rule", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/nomenclature.css`, "utf8");
    const eyebrow = css.match(
      /\.menu-categories-page\.is-dish-categories \.dishcat-header \.settings-title-group p\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(eyebrow).toMatch(/top:\s*8px/);
    // No whole-header shift: header keeps its grid/margin template.
    expect(css).not.toMatch(/\.dishcat-header\s*\{[^}]*margin-bottom:\s*20px/);
  });
});

// ── REORDER V1: drag-and-drop порядок (семейство «Места») ───────────────────
// jsdom не умеет настоящий pixel-drag (dnd-kit нужны layout rects, их даёт
// только браузер), поэтому здесь — структура, хелпер optimistic-merge и то,
// что недrag-взаимодействия never трогают reorder endpoint. Реальный
// drag→payload→optimistic→rollback живёт в ручном сценарии браузера.

describe("applyCategoryOrder (optimistic reorder merge)", () => {
  const A = { id: "A", sort_order: 0 };
  const B = { id: "B", sort_order: 1 };
  const C = { id: "C", sort_order: 2 };
  const ARCHIVED = { id: "X", sort_order: 5, is_active: false };

  it("renumbers only the sent ids 0..n-1 in the requested order", () => {
    // Хелпер меняет ТОЛЬКО sort_order (порядок массива не двигается — финальный
    // порядок даёт пересорт visible по sort_order, как и на странице).
    const out = applyCategoryOrder([A, B, C], ["C", "A", "B"]);
    const byId = Object.fromEntries(out.map((r) => [r.id, r.sort_order]));
    expect(byId).toEqual({ A: 1, B: 2, C: 0 });
  });

  it("never touches rows outside the sent (visible) list", () => {
    const out = applyCategoryOrder([A, B, ARCHIVED], ["B", "A"]);
    const byId = Object.fromEntries(out.map((r) => [r.id, r.sort_order]));
    expect(byId).toEqual({ A: 1, B: 0, X: 5 });
    expect(out.map((r) => r.id)).toEqual(["A", "B", "X"]);
  });

  it("returns a new array and never mutates the input (rollback safety)", () => {
    const input = [A, B];
    const out = applyCategoryOrder(input, ["B", "A"]);
    expect(out).not.toBe(input);
    expect(input.map((r) => r.sort_order)).toEqual([0, 1]);
  });
});

describe("Dish Categories — REORDER V1 structure & isolation", () => {
  it("matches the Dishes full shell without compressing category rows", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.menu-categories-page\.is-dish-categories:not\(\.dishcat-drag-overlay\)\s*\{[^}]*flex:\s*1 1 0%/);
    expect(css).toMatch(/body\.dashboard-body \.dashboard-content:has\(\.menu-categories-page\.is-dish-categories\)\s*\{[^}]*max-height:\s*calc\(100vh - 72px\)[^}]*padding-top:\s*14px[^}]*padding-bottom:\s*12px/);
    expect(css).toMatch(/\.menu-category-list\.dishcat-list\s*\{[^}]*grid-auto-rows:\s*max-content/);
  });
  it("renders a reorder grip per active row and none in the archived tab", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [
        { id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true },
        { id: "c2", name: "Архивная", slug: "arh", is_active: false, calculate_service: false, show_in_menu: false },
      ],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    // Active row: accessible, keyboard-focusable grip handle (Места-семейство).
    expect(screen.getByRole("button", { name: "Переместить категорию: Супы" })).toBeInTheDocument();
    // Archived tab: порядок не редактируется — grip отсутствует.
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Архивная");
    expect(screen.queryByRole("button", { name: /Переместить категорию/ })).toBeNull();
  });

  it("edit, archive-trash and modal interactions never call reorderCategories", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [{ id: "c1", name: "Супы", slug: "supy", is_active: true, calculate_service: true, show_in_menu: true }],
    });
    render(<CategoriesPage type="dishes" />);
    await screen.findByText("Супы");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    await screen.findByRole("dialog", { name: "Редактировать категорию" });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Архивировать категорию" }));
    await screen.findByRole("dialog", { name: "Архивировать категорию?" });
    expect(catalogService.reorderCategories).not.toHaveBeenCalled();
  });

  it("adds the grip column only to sortable rows (archived meta keeps 4 columns)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    const gripColumn = css.match(
      /\.menu-categories-page\.is-dish-categories \.dishcat-meta:has\(\.settings-place__grip\)\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(gripColumn).toMatch(/grid-template-columns:\s*auto auto auto auto 34px/);
    // Lift-состояние и подавление выделения на время drag (семейство Места).
    expect(css).toMatch(/\.dishcat-row\.is-dragging\s*\{/);
    expect(css).toMatch(/dishcat-list:has\(\.dishcat-row\.is-dragging\)/);
  });
});
