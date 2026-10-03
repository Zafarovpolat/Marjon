import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeRatesService } from "../../api/exchangeRates";
import TopbarRateWidget from "./TopbarRateWidget";

vi.mock("../../api/exchangeRates", () => ({
  exchangeRatesService: { get: vi.fn() },
}));

const rates = {
  USD: { Rate: "11825.4", Nominal: "1" },
  RUB: { Rate: "140.3", Nominal: "1" },
  KZT: { Rate: "26.7", Nominal: "1" },
  KGS: { Rate: "135", Nominal: "1" },
};

function mockReducedMotion(matches) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderWidget() {
  const view = render(<TopbarRateWidget />);
  const trigger = view.container.querySelector(".topbar-info-widget--rate");
  return { ...view, trigger };
}

describe("TopbarRateWidget popup motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockReducedMotion(false);
    exchangeRatesService.get.mockImplementation((currency) => Promise.resolve([rates[currency]]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enters on open and waits for the exit animation before unmounting", () => {
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    const popup = screen.getByRole("dialog", { name: "Курсы валют" });
    expect(popup).toHaveClass("is-opening");

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(container.querySelector(".usd-rate-popover")).toHaveClass("is-closing");

    act(() => vi.advanceTimersByTime(220));
    expect(container.querySelector(".usd-rate-popover")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders one decorative local flag for each supported currency", () => {
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    const flags = [...container.querySelectorAll(".currency-rate-card__flag")];

    expect(flags).toHaveLength(4);
    expect(flags.map((flag) => flag.getAttribute("data-country"))).toEqual(["US", "RU", "KZ", "KG"]);
    flags.forEach((flag) => {
      expect(flag).toHaveAttribute("alt", "");
      expect(flag).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("maps the converter source and target flags for every supported currency", () => {
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    const converterFlags = () => [...container.querySelectorAll(".usd-converter__flag")];
    expect(converterFlags().map((flag) => flag.getAttribute("data-country"))).toEqual(["US", "UZ"]);

    const expectedCountries = { RUB: "RU", KZT: "KZ", KGS: "KG" };
    Object.entries(expectedCountries).forEach(([currency, country]) => {
      const card = [...container.querySelectorAll(".currency-rate-card")]
        .find((button) => button.textContent.includes(currency));
      fireEvent.click(card);
      expect(converterFlags().map((flag) => flag.getAttribute("data-country"))).toEqual([country, "UZ"]);
    });

    converterFlags().forEach((flag) => {
      expect(flag).toHaveAttribute("alt", "");
      expect(flag).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("swaps values and flags at the animation midpoint and ignores rapid repeat clicks", async () => {
    const { container, trigger } = renderWidget();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(trigger);

    const swapButton = screen.getByRole("button", { name: "Поменять направление" });
    const inputs = () => [...container.querySelectorAll(".usd-converter input")];
    const flags = () => [...container.querySelectorAll(".usd-converter__flag")];

    expect(inputs().map((input) => input.value)).toEqual(["1", "11 825"]);
    fireEvent.click(swapButton);
    fireEvent.click(swapButton);
    expect(inputs()[0]).toHaveClass("is-swapping-out");
    expect(flags().map((flag) => flag.getAttribute("data-country"))).toEqual(["US", "UZ"]);

    act(() => vi.advanceTimersByTime(90));
    expect(inputs().map((input) => input.value)).toEqual(["11 825", "1,00"]);
    expect(flags().map((flag) => flag.getAttribute("data-country"))).toEqual(["UZ", "US"]);
    expect(inputs()[0]).toHaveClass("is-swapping-in");

    act(() => vi.advanceTimersByTime(90));
    expect(inputs()[0]).not.toHaveClass("is-swapping-in");
    expect(inputs().every((input) => !input.value.includes("NaN"))).toBe(true);

    fireEvent.click(swapButton);
    act(() => vi.advanceTimersByTime(180));
    expect(flags().map((flag) => flag.getAttribute("data-country"))).toEqual(["US", "UZ"]);
  });

  it("swaps immediately without value animation for reduced motion", async () => {
    mockReducedMotion(true);
    const { container, trigger } = renderWidget();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Поменять направление" }));

    const inputs = [...container.querySelectorAll(".usd-converter input")];
    const flags = [...container.querySelectorAll(".usd-converter__flag")];
    expect(inputs.map((input) => input.value)).toEqual(["11 825", "1,00"]);
    expect(inputs.every((input) => !input.className.includes("is-swapping"))).toBe(true);
    expect(flags.map((flag) => flag.getAttribute("data-country"))).toEqual(["UZ", "US"]);
  });

  it("uses the same exit state for Escape and outside click", () => {
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    let popup = screen.getByRole("dialog", { name: "Курсы валют" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(popup).toHaveClass("is-closing");
    act(() => vi.advanceTimersByTime(220));

    fireEvent.click(trigger);
    popup = screen.getByRole("dialog", { name: "Курсы валют" });
    fireEvent.mouseDown(document.body);
    expect(popup).toHaveClass("is-closing");
    act(() => vi.advanceTimersByTime(220));
    expect(container.querySelector(".usd-rate-popover")).not.toBeInTheDocument();
  });

  it("uses the exit state when the Topbar trigger toggles the popup closed", () => {
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    const popup = screen.getByRole("dialog", { name: "Курсы валют" });
    fireEvent.click(trigger);

    expect(popup).toHaveClass("is-closing");
    expect(container.querySelector(".usd-rate-popover")).toBeInTheDocument();
  });

  it("closes immediately when reduced motion is requested", () => {
    mockReducedMotion(true);
    const { container, trigger } = renderWidget();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(container.querySelector(".usd-rate-popover")).not.toBeInTheDocument();
  });
});
