import { test, expect } from "@playwright/test";

const OWNER_PHONE = "907778778";
const OWNER_PASSWORD = "102938";
const BALANCE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5176";

async function loginOwner(page) {
  await page.goto(`${BALANCE_BASE_URL}/login`);
  await page.locator(".login-pro-input-wrap--phone input").fill(OWNER_PHONE);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator(".login-pro-submit").click();
  await page.waitForURL(`${BALANCE_BASE_URL}/`);
  await page.getByRole("button", { name: "Баланс", exact: true }).waitFor({ state: "visible" });
}

async function openBalance(page) {
  await page.getByRole("button", { name: "Баланс", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Оплата" })).toBeVisible();
  await page.waitForTimeout(260);
}

async function shellMetrics(page) {
  return page.getByTestId("balance-payment-cta").evaluate((cta) => {
    const dialog = cta.closest('[role="dialog"]');
    const ctaRect = cta.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    return {
      ctaY: ctaRect.top,
      ctaContentY: ctaRect.top - dialogRect.top + dialog.scrollTop,
      ctaHeight: ctaRect.height,
      bottomGap: cta.closest(".balance-card-step__form").getBoundingClientRect().bottom - ctaRect.bottom,
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
    };
  });
}

async function enterValidCardDetails(page) {
  await page.getByRole("button", { name: "490 000", exact: true }).click();
  await page.getByPlaceholder("0000 0000 0000 0000").fill("4111111111111111");
  await page.getByPlaceholder("ММ/ГГ").fill("1228");
  await page.getByRole("checkbox").check();
}

test.describe("Balance payment card editing and CTA V9", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginOwner(page);
  });

  test("keeps one CTA baseline, quick amounts, checkbox polish and the Step 3 gate", async ({ page }) => {
    await openBalance(page);

    const step1 = await shellMetrics(page);
    await page.getByRole("button", { name: "Оплатить", exact: true }).click();

    await expect(page.getByRole("button", { name: "390 000", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "490 000", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "1 000 000", exact: true })).toBeVisible();
    await expect(page.getByTestId("balance-step-three")).toHaveJSProperty("tagName", "SPAN");

    const step2 = await shellMetrics(page);
    const gap = await page.locator(".balance-card-quick").evaluate((quick) => {
      const quickRect = quick.getBoundingClientRect();
      const gridRect = quick.nextElementSibling.getBoundingClientRect();
      return gridRect.top - quickRect.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(18);
    expect(gap).toBeLessThanOrEqual(22);

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveCSS("border-radius", "6px");
    await expect(checkbox).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveCSS("border-top-color", "rgb(29, 181, 181)");
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();

    await enterValidCardDetails(page);
    await expect(page.getByRole("button", { name: "Перейти к подтверждению" })).toBeEnabled();
    await page.getByRole("button", { name: "Перейти к подтверждению" }).click();

    const step3 = await shellMetrics(page);
    const ctaYs = [step1.ctaY, step2.ctaY, step3.ctaY];
    expect(Math.max(...ctaYs) - Math.min(...ctaYs)).toBeLessThanOrEqual(1);
    expect(step1.bottomGap).toBeGreaterThanOrEqual(16);
    expect(step1.bottomGap).toBeLessThanOrEqual(20);
    expect(step2.bottomGap).toBeCloseTo(step1.bottomGap, 0);
    expect(step3.bottomGap).toBeCloseTo(step1.bottomGap, 0);
    expect(step2.dialogWidth).toBeCloseTo(step1.dialogWidth, 0);
    expect(step3.dialogWidth).toBeCloseTo(step1.dialogWidth, 0);
    expect(step2.dialogHeight).toBeCloseTo(step1.dialogHeight, 0);
    expect(step3.dialogHeight).toBeCloseTo(step1.dialogHeight, 0);
    await expect(page.getByRole("button", { name: "Оплатить", exact: true })).toBeDisabled();
    await expect(page.getByText("490 000 UZS")).toBeVisible();
  });

  test("preserves the logical caret for middle edits and paste replacement", async ({ page }) => {
    await openBalance(page);
    await page.getByRole("button", { name: "Оплатить", exact: true }).click();
    const card = page.getByPlaceholder("0000 0000 0000 0000");

    await card.fill("561812924940644");
    await card.evaluate((input) => input.setSelectionRange(11, 11));
    await card.press("7");
    await expect(card).toHaveValue("5618 1292 4794 0644");
    expect(await card.evaluate((input) => input.selectionStart)).toBe(12);

    await card.fill("5618129249406444");
    await card.evaluate((input) => input.setSelectionRange(10, 10));
    await card.press("Backspace");
    await expect(card).toHaveValue("5618 1294 9406 444");

    await card.fill("5618129249406444");
    await card.evaluate((input) => input.setSelectionRange(9, 9));
    await card.press("Delete");
    await expect(card).toHaveValue("5618 1292 9406 444");

    await card.fill("5618129249406444");
    await card.evaluate((input) => input.setSelectionRange(10, 14));
    await card.pressSequentially("1234");
    await expect(card).toHaveValue("5618 1292 1234 6444");
    expect(await card.evaluate((input) => input.selectionStart)).toBe(15);

    await card.evaluate((input) => {
      input.setSelectionRange(10, 14);
      const clipboard = new DataTransfer();
      clipboard.setData("text", "5678");
      input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
    });
    await expect(card).toHaveValue("5618 1292 5678 6444");
    expect(await card.evaluate((input) => input.selectionStart)).toBe(15);
  });

  for (const viewport of [
    { name: "1024", width: 1024, height: 900 },
    { name: "390", width: 390, height: 900 },
  ]) {
    test(`keeps responsive geometry and contained quick chips at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openBalance(page);

      const step1 = await shellMetrics(page);
      await page.getByRole("button", { name: "Оплатить", exact: true }).click();
      const step2 = await shellMetrics(page);
      await enterValidCardDetails(page);
      await page.getByRole("button", { name: "Перейти к подтверждению" }).click();
      const step3 = await shellMetrics(page);

      const contentYs = [step1.ctaContentY, step2.ctaContentY, step3.ctaContentY];
      expect(Math.max(...contentYs) - Math.min(...contentYs)).toBeLessThanOrEqual(1);
      expect(step2.dialogHeight).toBeCloseTo(step1.dialogHeight, 0);
      expect(step3.dialogHeight).toBeCloseTo(step1.dialogHeight, 0);

      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(pageOverflow).toBeLessThanOrEqual(1);

      await page.getByRole("button", { name: "Вернуться к данным карты" }).click();
      const chipContainment = await page.locator(".balance-card-quick").evaluate((row) => ({
        clientWidth: row.clientWidth,
        scrollWidth: row.scrollWidth,
        right: row.getBoundingClientRect().right,
        buttonRights: [...row.querySelectorAll("button")].map((button) => button.getBoundingClientRect().right),
      }));
      expect(chipContainment.scrollWidth).toBeLessThanOrEqual(chipContainment.clientWidth);
      expect(Math.max(...chipContainment.buttonRights)).toBeLessThanOrEqual(chipContainment.right + 1);
    });
  }
});
