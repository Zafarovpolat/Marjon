import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "../i18n/index.js";
import { __resetReportCache } from "../pages/reports/reportResultCache";

// TEST-WAIT-01: бюджет ожидания для findBy*/waitFor.
//
// Дефолт Testing Library — 1000 мс. Этого хватает на пустой компонент, но не
// на тяжёлые страницы (матрица прав сотрудника — 50 модулей × 4 действия,
// ≈250 кнопок с role/aria; каталог блюд; склад). В полном прогоне 123 файла
// идут в два форка, jsdom суммарно тратит ~28 минут CPU, и один рендер
// укладывается в 1–3 с. Отсюда «плавающие» падения: каждый раз другой файл,
// всегда на `findByText("Загрузка сотрудников...")` или пустой таблице —
// данные просто не успевали прийти. Это не регрессия продукта, а тестовый
// таймаут, поэтому бюджет поднят до 5 с. `testTimeout` (45 с) не трогаем:
// он про общую длительность теста, а не про ожидание одного элемента.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  // The Reports session cache is a module-level singleton; clear it between
  // tests so a cached result from one case never leaks into the next.
  __resetReportCache();
});
