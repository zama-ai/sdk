import { test, expect, TEST_ADDRESS } from "./fixtures";

test.describe("connect screen", () => {
  test.beforeEach(async ({ page, mockRpc }) => {
    await mockRpc();
    await page.goto("/");
  });

  test("shows connect screen title", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Hoodi Confidential Tokens — Ledger" }),
    ).toBeVisible();
  });

  test("shows Connect Ledger button on load", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Connect Ledger" })).toBeVisible();
  });

  test("shows Ethereum app instructions", async ({ page }) => {
    await expect(page.getByText(/Ethereum app/)).toBeVisible();
  });

  test("shows account index selector with default Account #0", async ({ page }) => {
    const select = page.locator("#account-index");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("0");
  });

  test("account selector lists accounts #0 through #4", async ({ page }) => {
    const select = page.locator("#account-index");
    await expect(select.locator("option")).toHaveCount(5);
    await expect(select.locator("option").first()).toContainText("Account #0");
    await expect(select.locator("option").last()).toContainText("Account #4");
  });

  test("changing account index updates the selector", async ({ page }) => {
    const select = page.locator("#account-index");
    await select.selectOption("2");
    await expect(select).toHaveValue("2");
  });

  test("shows error when connect fails (no device)", async ({ page }) => {
    // Wait for __ledgerProvider, then override connect() to throw.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.waitForFunction(() => !!(window as any).__ledgerProvider, { timeout: 10_000 });
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ledgerProvider.connect = async () => {
        throw new Error("No Ledger device found. Please connect your device and try again.");
      };
    });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText(/No Ledger device found/)).toBeVisible();
  });

  test("connects after clicking and shows main screen", async ({ page, mockLedger }) => {
    await mockLedger({ address: TEST_ADDRESS });
    // force: true bypasses stability check during the "Connect Ledger" → "Connecting…" transition.
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("connected address appears in header", async ({ page, mockLedger }) => {
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText(/Connected:/)).toBeVisible();
    await expect(page.getByText(/0xf39Fd6e51aad/i)).toBeVisible();
  });

  test("selected account index is reflected in the header after connect", async ({
    page,
    mockLedger,
  }) => {
    const select = page.locator("#account-index");
    await select.selectOption("3");
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText(/Account #3/)).toBeVisible();
  });
});
