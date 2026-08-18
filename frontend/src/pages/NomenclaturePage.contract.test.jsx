import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import NomenclaturePage, { buildNomenclatureProductPayload, mapNomenclatureProduct } from "./NomenclaturePage";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const backendProduct = {
  id: "product-uuid",
  company_id: "company-uuid",
  category_id: null,
  subcategory_id: null,
  product_type: "dish",
  printer_id: null,
  name: "Backend dish",
  description: null,
  image_url: null,
  price: 45000,
  cost_price: 18000,
  tax_rate: 0,
  unit: "шт",
  barcode: null,
  sku: null,
  is_active: true,
  is_available: true,
  sort_order: 1,
  category_name: null,
  subcategory_name: null,
  printer_name: null,
  ingredients_count: 0,
  stock: null,
  ingredients: [],
};

describe("APP nomenclature product contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    api.get.mockResolvedValue({ data: [] });
  });

  it("builds schema-only create and update payloads", () => {
    const form = {
      name: "Local draft",
      sort: "4",
      type: "Реализация",
      unit: "порция",
      cost: "12 500 UZS",
      price: "25000",
      menu: "Unsupported menu",
      subcategory: "Unsupported subcategory",
      chef: "Unsupported station",
      auto: true,
      set: true,
    };

    expect(buildNomenclatureProductPayload(form)).toEqual({
      name: "Local draft",
      sort_order: 4,
      product_type: "sale",
      unit: "порция",
      cost_price: 12500,
      price: 25000,
    });
    expect(buildNomenclatureProductPayload(form, { isUpdate: true })).toEqual({
      name: "Local draft",
      sort_order: 4,
      product_type: "sale",
      cost_price: 12500,
      price: 25000,
    });
  });

  it("rejects malformed money and sort text instead of partially coercing it", async () => {
    render(<NomenclaturePage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Invalid draft" } });
    fireEvent.change(screen.getByLabelText("Сорт"), { target: { value: "1e2" } });
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "12abc34" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.post).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Сорт"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Себестоимость"), { target: { value: "12abc34" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("maps only backend-confirmed response values", () => {
    expect(mapNomenclatureProduct(backendProduct)).toMatchObject({
      id: "product-uuid",
      name: "Backend dish",
      price: "45000",
      menu: "",
      subcategory: "",
      chef: "",
      auto: null,
      set: null,
      stock: "-",
    });
  });

  it("uses the create response as the post-save source of truth", async () => {
    api.post.mockResolvedValue({ data: { ...backendProduct, id: "created-uuid", name: "Server-created name", price: 777 } });
    render(<NomenclaturePage />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/inventory/products", expect.objectContaining({ signal: expect.any(AbortSignal) })));
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Local-only name" } });
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/inventory/products", expect.objectContaining({
      name: "Local-only name",
      price: 999,
    })));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("category_name");
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("subcategory_name");
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("station");
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("auto_write_off");
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("is_set");
    expect(await screen.findByText("Server-created name")).toBeInTheDocument();
    expect(screen.queryByText("Local-only name")).not.toBeInTheDocument();
  });

  it("uses the update response without merging unsupported local values", async () => {
    api.get.mockResolvedValue({ data: [backendProduct] });
    api.patch.mockResolvedValue({ data: { ...backendProduct, name: "Server-updated name", price: 88000 } });
    render(<NomenclaturePage />);

    expect(await screen.findByText("Backend dish")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Local update" } });
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "99000" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/inventory/products/product-uuid", expect.objectContaining({
      name: "Local update",
      price: 99000,
    })));
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty("unit");
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty("station");
    expect(await screen.findByText("Server-updated name")).toBeInTheDocument();
    expect(screen.queryByText("Local update")).not.toBeInTheDocument();
  });

  it("does not mutate product truth when save fails", async () => {
    api.get.mockResolvedValue({ data: [backendProduct] });
    api.patch.mockRejectedValue(new Error("save failed"));
    render(<NomenclaturePage />);

    expect(await screen.findByText("Backend dish")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Unsaved local name" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("save failed");
    expect(screen.getByText("Backend dish")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved local name")).not.toBeInTheDocument();
  });
});
