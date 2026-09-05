import { expect, test } from "@playwright/test";

const STATUS = { id: "status-1", name: "Подключена", sort: 10, status: true };
const ORGANIZATION = {
  id: "org-1",
  name: "Canonical Cafe",
  type: "cafe",
  tariff_price: "125000.00",
  working_days: 24,
  tin: "309998877",
  installation_date: "2026-08-15",
  organization_status_id: STATUS.id,
  status: "active",
  online_menu: true,
  enabled_storage_integration: false,
  is_solvent: true,
  is_billing_autoblock: false,
  owner_name: null,
  admin_name: "Canonical Admin",
  branches_count: null,
  cash_balance: "9000.00",
};
const HQ_BASE_URL = process.env.HQ_BROWSER_BASE_URL || "http://localhost:5173";

function page(items, overrides = {}) {
  return { items, total: items.length, page: 1, size: 20, pages: 1, ...overrides };
}

async function installContractReplay(browserPage) {
  const evidence = { organizationGets: [], writes: [] };
  await browserPage.addInitScript(() => {
    localStorage.setItem("admin_access_token", "hq-browser-access-token");
    localStorage.setItem("admin_refresh_token", "hq-browser-refresh-token");
  });
  await browserPage.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (path.endsWith("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "hq-1", name: "HQ Browser", phone: "+998900000000", auth_scope: "hq_admin", is_superadmin: true }) });
    }
    if (path.endsWith("/organization-statuses") && method === "GET") {
      const search = url.searchParams.get("search");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(search === "missing" ? page([]) : page([STATUS])) });
    }
    if (path.endsWith("/organization-statuses") && method === "POST") {
      evidence.writes.push({ method, path, body: request.postDataJSON() });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "status-created", ...request.postDataJSON() }) });
    }
    if (path.includes("/organization-statuses/") && (method === "PATCH" || method === "DELETE")) {
      evidence.writes.push({ method, path, body: method === "PATCH" ? request.postDataJSON() : null });
      return route.fulfill({ status: method === "DELETE" ? 204 : 200, contentType: "application/json", body: method === "DELETE" ? "" : JSON.stringify({ ...STATUS, ...request.postDataJSON() }) });
    }
    if (path.endsWith("/organizations") && method === "GET") {
      evidence.organizationGets.push(url.search);
      const currentPage = Number(url.searchParams.get("page") || 1);
      const search = url.searchParams.get("search");
      if (search === "server-error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Mock organization error" }) });
      if (search === "missing") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(page([])) });
      const item = currentPage === 2 ? { ...ORGANIZATION, id: "org-2", name: "Second Page Cafe" } : ORGANIZATION;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(page([item], { total: 45, page: currentPage, pages: 3 })) });
    }
    if (path.endsWith("/organizations") && method === "POST") {
      evidence.writes.push({ method, path, body: request.postDataJSON() });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...ORGANIZATION, ...request.postDataJSON(), id: "org-created" }) });
    }
    if (path.includes("/organizations/") && (method === "PATCH" || method === "DELETE")) {
      evidence.writes.push({ method, path, body: method === "PATCH" ? request.postDataJSON() : null });
      return route.fulfill({ status: method === "DELETE" ? 204 : 200, contentType: "application/json", body: method === "DELETE" ? "" : JSON.stringify({ ...ORGANIZATION, ...request.postDataJSON() }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(page([])) });
  });
  return evidence;
}

async function openOrganizations(pageObject) {
  await pageObject.goto(`${HQ_BASE_URL}/admin.html`);
  await expect(pageObject.locator(".admin-shell")).toBeVisible();
  await pageObject.getByRole("button", { name: "Организации", exact: true }).click();
  await pageObject.getByRole("button", { name: "Организация", exact: true }).click();
  await expect(pageObject.getByText("Canonical Cafe")).toBeVisible();
}

test.describe("HQ-01 organizations contract replay", () => {
  test("list, server pagination, filters, create, edit, lifecycle, and error", async ({ page: browserPage }) => {
    const evidence = await installContractReplay(browserPage);
    await browserPage.setViewportSize({ width: 1280, height: 800 });
    await openOrganizations(browserPage);

    expect(evidence.organizationGets.filter((query) => query.includes("page=1") && query.includes("size=20"))).toHaveLength(1);
    expect(evidence.organizationGets.some((query) => query.includes("size=100"))).toBe(false);
    await expect(browserPage.getByText("—", { exact: true }).first()).toBeVisible();
    await expect(browserPage.getByText("Подключена", { exact: true }).last()).toBeVisible();

    await browserPage.getByRole("button", { name: "Следующая страница" }).click();
    await expect(browserPage.getByText("Second Page Cafe")).toBeVisible();
    expect(evidence.organizationGets.at(-1)).toContain("page=2");

    await browserPage.getByPlaceholder("Поиск по названию или ИНН").fill("missing");
    await browserPage.getByRole("button", { name: "Применить" }).click();
    await expect(browserPage.getByText("По заданным условиям организации не найдены.")).toBeVisible();
    expect(evidence.organizationGets.at(-1)).toContain("search=missing");

    await browserPage.getByRole("button", { name: "Сбросить" }).click();
    await expect(browserPage.getByText("Canonical Cafe")).toBeVisible();
    await browserPage.getByRole("button", { name: /^Добавить/ }).click();
    const createDialog = browserPage.getByRole("dialog", { name: "Добавить организацию" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel("Название").fill("Browser Created");
    await createDialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(createDialog).toBeHidden();
    expect(evidence.writes.some((write) => write.method === "POST" && write.path.endsWith("/organizations") && write.body.name === "Browser Created")).toBe(true);

    await expect(browserPage.getByText("Canonical Cafe")).toBeVisible();
    await browserPage.getByRole("button", { name: "Редактировать Canonical Cafe" }).click();
    const editDialog = browserPage.getByRole("dialog", { name: "Редактировать Canonical Cafe" });
    await expect(editDialog.getByLabel("Название")).toHaveValue("Canonical Cafe");
    await expect(editDialog.getByLabel("ИНН")).toHaveValue("309998877");
    await editDialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(editDialog).toBeHidden();
    expect(evidence.writes.some((write) => write.method === "PATCH" && write.path.endsWith("/organizations/org-1") && write.body.organization_status_id === STATUS.id)).toBe(true);

    await browserPage.getByRole("button", { name: "Заблокировать Canonical Cafe" }).click();
    await browserPage.getByRole("dialog", { name: "Заблокировать организацию" }).getByRole("button", { name: "Подтвердить" }).click();
    await expect.poll(() => evidence.writes.some((write) => write.method === "PATCH" && write.body?.status === "blocked")).toBe(true);

    await browserPage.getByPlaceholder("Поиск по названию или ИНН").fill("server-error");
    await browserPage.getByRole("button", { name: "Применить" }).click();
    await expect(browserPage.getByRole("alert")).toContainText("Mock organization error");
  });

  test("status directory CRUD and server filtering", async ({ page: browserPage }) => {
    const evidence = await installContractReplay(browserPage);
    await browserPage.setViewportSize({ width: 1440, height: 900 });
    await browserPage.goto(`${HQ_BASE_URL}/admin.html`);
    await expect(browserPage.locator(".admin-shell")).toBeVisible();
    await browserPage.getByRole("button", { name: "Организации", exact: true }).click();
    await browserPage.getByRole("button", { name: "Статус организации", exact: true }).click();
    await expect(browserPage.getByText("Подключена")).toBeVisible();

    await browserPage.getByRole("button", { name: /^Добавить/ }).click();
    await browserPage.getByPlaceholder("Название статуса").fill("Browser Status");
    await browserPage.getByRole("button", { name: "Сохранить" }).click();
    await expect.poll(() => evidence.writes.some((write) => write.method === "POST" && write.path.endsWith("/organization-statuses"))).toBe(true);

    await browserPage.getByRole("button", { name: "Редактировать Подключена" }).click();
    await expect(browserPage.getByPlaceholder("Название статуса")).toHaveValue("Подключена");
    await browserPage.getByRole("button", { name: "Отмена" }).click();

    await browserPage.getByRole("button", { name: "#активно" }).click();
    await expect.poll(() => evidence.writes.some((write) => write.method === "PATCH" && write.body?.status === false)).toBe(true);

    await browserPage.getByPlaceholder("Поиск по названию").fill("missing");
    await browserPage.getByRole("button", { name: "Применить" }).click();
    await expect(browserPage.getByText("По заданным условиям статусы не найдены.")).toBeVisible();
  });

  for (const viewport of [
    { width: 1280, height: 800, label: "1280" },
    { width: 1440, height: 900, label: "1440" },
    { width: 1280, height: 720, label: "1280x720" },
  ]) {
    test(`${viewport.label}: table, filters, pagination, modal, and sidebar stay contained`, async ({ page: browserPage }) => {
      await installContractReplay(browserPage);
      await browserPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await openOrganizations(browserPage);
      await expect(browserPage.locator(".org-directory-toolbar")).toBeVisible();
      await expect(browserPage.locator(".admin-data-table-shell")).toBeVisible();
      await expect(browserPage.locator(".admin-data-footer")).toBeVisible();
      await browserPage.getByRole("button", { name: /^Добавить/ }).click();
      const dialog = browserPage.getByRole("dialog", { name: "Добавить организацию" });
      await expect(dialog).toBeVisible();
      const probe = await browserPage.evaluate(() => {
        const modal = document.querySelector(".org-directory-modal__panel").getBoundingClientRect();
        return {
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          modalTop: modal.top,
          modalBottom: modal.bottom,
          viewportHeight: window.innerHeight,
        };
      });
      expect(probe.documentOverflow).toBeLessThanOrEqual(1);
      expect(probe.modalTop).toBeGreaterThanOrEqual(0);
      expect(probe.modalBottom).toBeLessThanOrEqual(probe.viewportHeight + 1);
      await browserPage.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  }
});
