import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import DishesDialogs from "./DishesDialogs";
import { emptyDishForm } from "./nomenclatureConfig";
import { useDishesCatalog } from "./useDishesCatalog";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const image = (type = "image/png") => new File(["image bytes"], "photo.png", { type });
const clipboard = (file) => ({
  items: [
    { kind: "string", type: "text/html" },
    { kind: "file", type: file.type, getAsFile: () => file },
  ],
  files: [],
});

function props(overrides = {}) {
  return {
    drawerOpen: true, form: { ...emptyDishForm }, setForm: vi.fn(),
    setDrawerOpen: vi.fn(), saveDish: vi.fn(), handlePhotoChange: vi.fn(),
    ...overrides,
  };
}

describe("dish photo clipboard and file drop", () => {
  it("keeps matching compact photo actions, raised positioning and a prominent drop target", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const actions = css.match(/\.dish-drawer \.dish-photo-actions \.cashier-photo__upload\s*\{([^}]+)\}/)?.[1];
    expect(actions).toMatch(/width:\s*100%/);
    expect(actions).toMatch(/min-height:\s*30px/);
    expect(actions).toMatch(/box-sizing:\s*border-box/);
    expect(actions).toMatch(/font-size:\s*13px/);
    expect(actions).toMatch(/font-weight:\s*600/);
    expect(actions).toMatch(/line-height:\s*1\.5/);
    const body = css.match(/\.dish-drawer \.cashier-photo__body\s*\{([^}]+)\}/)?.[1];
    expect(body).toMatch(/transform:\s*translateY\(-7px\)/);
    expect(css).not.toContain(".dish-drawer-photo-delete");
    const drop = css.match(/\.dish-drawer \.cashier-photo\.is-drag-over\s*\{([^}]+)\}/)?.[1];
    expect(drop).toMatch(/background:\s*#c9f4f1/);
    expect(drop).toMatch(/border-style:\s*dashed/);
    expect(drop).toMatch(/box-shadow:\s*inset 0 0 0 1px #079ba5,\s*0 0 0 5px/);
    expect(drop).not.toMatch(/(?:border-width|padding|margin|height):/);
  });

  it("shows a separate delete action below Replace photo without hover or the old hint", () => {
    render(<DishesDialogs {...props({ editing: { id: "dish-1" }, form: { ...emptyDishForm, photo: "/photo.png" } })} />);
    const remove = screen.getByRole("button", { name: "Удалить фото блюда" });
    const replace = screen.getByText("Заменить фото");
    expect(remove).toHaveTextContent("Удалить фото");
    expect(remove).toHaveClass("cashier-photo__upload");
    expect(replace).toHaveClass("cashier-photo__upload");
    expect(replace.nextElementSibling).toBe(remove);
    expect(document.querySelector(".staff-avatar button")).toBeNull();
    expect(screen.queryByText(/Скопируйте фото/)).not.toBeInTheDocument();
    fireEvent.click(remove);
    expect(screen.getByRole("dialog", { name: "Удалить фото блюда" })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("opens the saved photo in the same centered viewer skin as the table, then restores focus", () => {
    const viewProps = props({ editing: { id: "dish-1" }, form: { ...emptyDishForm, name: "Комбо", photo: "/photo.png" } });
    render(<DishesDialogs {...viewProps} />);
    const thumbnail = screen.getByRole("button", { name: "Открыть фото Комбо" });
    thumbnail.focus();
    fireEvent.click(thumbnail);
    const viewer = screen.getByRole("dialog", { name: "Фото блюда Комбо" });
    expect(viewer.closest(".dish-photo-viewer-layer").parentElement).toBe(document.body);
    expect(viewer.querySelector("img")).toHaveAttribute("src", "/photo.png");
    expect(screen.getByRole("button", { name: "Закрыть фото" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть фото" }));
    expect(screen.queryByRole("dialog", { name: "Фото блюда Комбо" })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    expect(viewProps.saveDish).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("opens the unsaved replacement instead of the old photo and closes with Escape", () => {
    const viewProps = props({ editing: { id: "dish-1" }, form: { ...emptyDishForm, name: "Суп", photo: "/old.png" }, photoPreview: "blob:new" });
    render(<DishesDialogs {...viewProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото Суп" }));
    expect(screen.getByRole("dialog", { name: "Фото блюда Суп" }).querySelector("img")).toHaveAttribute("src", "blob:new");
    fireEvent.paste(document, { clipboardData: clipboard(image()) });
    expect(viewProps.handlePhotoChange).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Фото блюда Суп" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Редактировать блюдо" })).toBeInTheDocument();
  });

  it("closes the enlarged photo with its backdrop and resets it when the drawer is closed", () => {
    const viewProps = props({ form: { ...emptyDishForm, name: "Суп", photo: "/photo.png" } });
    const view = render(<DishesDialogs {...viewProps} />);
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Открыть фото Суп" }));
    open();
    fireEvent.click(document.querySelector(".dish-photo-viewer-overlay"));
    expect(screen.queryByRole("dialog", { name: "Фото блюда Суп" })).not.toBeInTheDocument();
    open();
    view.rerender(<DishesDialogs {...viewProps} drawerOpen={false} />);
    view.rerender(<DishesDialogs {...viewProps} />);
    expect(screen.queryByRole("dialog", { name: "Фото блюда Суп" })).not.toBeInTheDocument();
  });

  it("does not open a viewer for an empty thumbnail and keeps a stronger thumbnail border", () => {
    render(<DishesDialogs {...props()} />);
    expect(screen.queryByRole("button", { name: /Открыть фото/ })).not.toBeInTheDocument();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css.match(/\.dish-drawer \.cashier-photo \.staff-avatar--large\s*\{([^}]+)\}/)?.[1])
      .toMatch(/border:\s*2px solid #80b5c5/);
  });

  it("accepts Copy image from another tab without an input being focused", () => {
    const viewProps = props();
    render(<DishesDialogs {...viewProps} />);
    const file = image();
    expect(fireEvent.paste(document, { clipboardData: clipboard(file) })).toBe(false);
    expect(viewProps.handlePhotoChange).toHaveBeenCalledExactlyOnceWith({ target: { files: [file] } });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("supports clipboard files and picks only the first image", () => {
    const viewProps = props();
    render(<DishesDialogs {...viewProps} />);
    const file = image();
    fireEvent.paste(document, { clipboardData: { files: [new File(["text"], "a.txt", { type: "text/plain" }), file, image()] } });
    expect(viewProps.handlePhotoChange).toHaveBeenCalledExactlyOnceWith({ target: { files: [file] } });
  });

  it("leaves text, copied links and HTML paste unchanged", () => {
    const viewProps = props();
    render(<DishesDialogs {...viewProps} />);
    expect(fireEvent.paste(screen.getByLabelText("Название"), {
      clipboardData: { files: [], items: [{ kind: "string", type: "text/html" }], getData: () => "https://example.com/image.png" },
    })).toBe(true);
    expect(viewProps.handlePhotoChange).not.toHaveBeenCalled();
  });

  it.each([{ saving: true }, { drawerClosing: true }, { drawerOpen: false }])("does not paste while unavailable: %j", (state) => {
    const viewProps = props(state);
    render(<DishesDialogs {...viewProps} />);
    expect(fireEvent.paste(document, { clipboardData: clipboard(image()) })).toBe(true);
    expect(viewProps.handlePhotoChange).not.toHaveBeenCalled();
  });

  it("removes the paste listener on unmount and does not duplicate it on rerender", () => {
    const viewProps = props();
    const view = render(<DishesDialogs {...viewProps} />);
    view.rerender(<DishesDialogs {...viewProps} form={{ ...emptyDishForm, name: "Суп" }} />);
    fireEvent.paste(document, { clipboardData: clipboard(image()) });
    expect(viewProps.handlePhotoChange).toHaveBeenCalledTimes(1);
    view.unmount();
    fireEvent.paste(document, { clipboardData: clipboard(image()) });
    expect(viewProps.handlePhotoChange).toHaveBeenCalledTimes(1);
  });

  it("accepts an image file dropped onto the photo block, without navigating", () => {
    const viewProps = props();
    render(<DishesDialogs {...viewProps} />);
    const file = image("image/webp");
    const block = document.querySelector(".cashier-photo");
    const dataTransfer = { files: [file], dropEffect: "none" };
    expect(fireEvent.dragOver(block, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(block).toHaveClass("is-drag-over");
    expect(screen.queryByText("Отпустите фото здесь")).not.toBeInTheDocument();
    expect(fireEvent.drop(block, { dataTransfer })).toBe(false);
    expect(block).not.toHaveClass("is-drag-over");
    expect(viewProps.handlePhotoChange).toHaveBeenCalledExactlyOnceWith({ target: { files: [file] } });
  });

  it("does not replace the photo with a drop during saving", () => {
    const viewProps = props({ saving: true });
    render(<DishesDialogs {...viewProps} />);
    expect(fireEvent.drop(document.querySelector(".cashier-photo"), { dataTransfer: { files: [image()] } })).toBe(false);
    expect(viewProps.handlePhotoChange).not.toHaveBeenCalled();
  });

  it("keeps the highlight when crossing children, then clears it on exit", () => {
    render(<DishesDialogs {...props()} />);
    const block = document.querySelector(".cashier-photo");
    const child = block.querySelector(".staff-avatar");
    const dataTransfer = { items: [{ kind: "file", type: "image/png" }], files: [] };
    fireEvent.dragEnter(block, { dataTransfer });
    expect(block).toHaveClass("is-drag-over");
    fireEvent.dragEnter(child, { dataTransfer });
    fireEvent.dragLeave(child, { dataTransfer });
    expect(block).toHaveClass("is-drag-over");
    fireEvent.dragLeave(block, { dataTransfer });
    expect(block).not.toHaveClass("is-drag-over");
  });

  it.each(["dragEnd", "drop"])("clears the highlight after %s elsewhere", (event) => {
    render(<DishesDialogs {...props()} />);
    const block = document.querySelector(".cashier-photo");
    fireEvent.dragEnter(block, { dataTransfer: { types: ["Files"] } });
    expect(block).toHaveClass("is-drag-over");
    fireEvent[event](document);
    expect(block).not.toHaveClass("is-drag-over");
  });

  it("does not advertise accepting text or non-image files", () => {
    render(<DishesDialogs {...props()} />);
    const block = document.querySelector(".cashier-photo");
    for (const item of [{ kind: "string", type: "text/plain" }, { kind: "file", type: "application/pdf" }]) {
      const dataTransfer = { items: [item], types: ["Files"], dropEffect: "copy" };
      fireEvent.dragEnter(block, { dataTransfer });
      fireEvent.dragOver(block, { dataTransfer });
      expect(block).not.toHaveClass("is-drag-over");
      expect(dataTransfer.dropEffect).toBe("none");
    }
  });

  it("clears the highlight when saving starts and does not retain it on reopen", () => {
    const viewProps = props();
    const view = render(<DishesDialogs {...viewProps} />);
    const block = document.querySelector(".cashier-photo");
    fireEvent.dragEnter(block, { dataTransfer: { types: ["Files"] } });
    expect(block).toHaveClass("is-drag-over");
    view.rerender(<DishesDialogs {...viewProps} saving />);
    expect(block).not.toHaveClass("is-drag-over");
    view.rerender(<DishesDialogs {...viewProps} drawerOpen={false} />);
    view.rerender(<DishesDialogs {...viewProps} />);
    expect(document.querySelector(".cashier-photo")).not.toHaveClass("is-drag-over");
  });
});

describe("pasted photo uses the existing preview and upload pipeline", () => {
  let createObjectURL;
  let revokeObjectURL;
  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValue("blob:second");
    revokeObjectURL = vi.fn();
    const NativeURL = globalThis.URL;
    vi.stubGlobal("URL", class extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url) => Promise.resolve({ data: {
      id: "dish-1", name: "Суп", product_type: "dish", price: 14000, sort_order: 1,
      image_url: url.endsWith("/photo") ? "/uploads/photo.png" : null,
    } }));
  });

  it("previews, replaces, then uploads the selected file only after Save", async () => {
    function Harness() {
      const catalog = useDishesCatalog();
      return <>
        <button onClick={() => catalog.openDrawer()}>Открыть форму</button>
        <DishesDialogs {...catalog} />
      </>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Открыть форму"));
    fireEvent.paste(document, { clipboardData: clipboard(image()) });
    expect(screen.getByAltText("Новое фото блюда")).toHaveAttribute("src", "blob:first");
    const second = image();
    fireEvent.paste(document, { clipboardData: clipboard(second) });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(screen.getByAltText("Новое фото блюда")).toHaveAttribute("src", "blob:second");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Суп" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/inventory/products/dish-1/photo", expect.any(FormData)));
    const [, body] = api.post.mock.calls.find(([url]) => url.endsWith("/photo"));
    expect(body.get("file")).toBe(second);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:second"));
  });

  it("keeps supported formats validation for pasted files", async () => {
    const { result } = renderHook(() => useDishesCatalog());
    act(() => result.current.handlePhotoChange({ target: { files: [image("image/gif")] } }));
    expect(result.current.actionError).toBe("Поддерживаются только JPG, PNG и WebP.");
    expect(result.current.photoFile).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
