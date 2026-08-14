import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hqService } from "./hqService";
import { SaleCategoryPage } from "./AdminCatalog";

// Регрессия FE-08A blocker: эффект загрузки в SaleCategoryPage возвращал
// cleanup `() => { activeRequest = false; }`, но переменную не объявлял →
// ReferenceError при размонтировании (уход с HQ → Номенклатура → Категория
// реализации). Тест гоняет реальный жизненный цикл компонента.
vi.mock("./hqService", () => ({
  hqService: {
    listCategories: vi.fn(),
  },
}));

describe("SaleCategoryPage — очистка запроса при размонтировании", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("рендерит категории и не бросает ReferenceError при размонтировании", async () => {
    hqService.listCategories.mockResolvedValue({
      data: [{ id: "c1", name: "Категория А" }, { id: "c2", name: "Категория Б" }],
    });

    const { unmount } = render(<SaleCategoryPage search="" onNotify={vi.fn()} />);
    expect(await screen.findByText("Категория А")).toBeInTheDocument();

    // До фикта unmount синхронно выбрасывал "ReferenceError: activeRequest is not defined".
    expect(() => unmount()).not.toThrow();
  });

  it("не обновляет состояние, если запрос завершился уже после размонтирования", async () => {
    let resolveLoad;
    hqService.listCategories.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<SaleCategoryPage search="" onNotify={vi.fn()} />);
    // Размонтируем ДО ответа сервиса.
    expect(() => unmount()).not.toThrow();

    // Поздний ответ не должен приводить к обновлению состояния/ошибке.
    resolveLoad({ data: [{ id: "c3", name: "Поздняя категория" }] });
    await waitFor(() => expect(hqService.listCategories).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("Поздняя категория")).not.toBeInTheDocument();
    const stateUpdateWarning = errorSpy.mock.calls.find((args) =>
      String(args[0]).includes("unmounted") || String(args[0]).includes("not wrapped in act"));
    expect(stateUpdateWarning).toBeUndefined();
  });
});
