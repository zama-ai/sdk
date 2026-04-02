import { test, expect, TEST_ADDRESS } from "./fixtures";

// All tests in this suite start with a connected Ledger (main screen visible).
test.describe("disconnect recovery", () => {
  test.beforeEach(async ({ page, mockRpc, mockLedger }) => {
    await mockRpc();
    await page.goto("/");
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("returns to connect screen when device is unplugged", async ({
    page,
    simulateDisconnect,
  }) => {
    await simulateDisconnect();
    await expect(page.getByRole("button", { name: "Connect Ledger" })).toBeVisible();
    await expect(page.getByText("Balances")).not.toBeVisible();
  });

  test("shows connect screen title after disconnect", async ({ page, simulateDisconnect }) => {
    await simulateDisconnect();
    await expect(
      page.getByRole("heading", { name: "Sepolia Confidential Tokens — Ledger" }),
    ).toBeVisible();
  });

  test("can reconnect after disconnect", async ({ page, mockLedger, simulateDisconnect }) => {
    await simulateDisconnect();
    await expect(page.getByRole("button", { name: "Connect Ledger" })).toBeVisible();

    // Re-mock and reconnect.
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("Disconnect button returns to connect screen", async ({ page }) => {
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("button", { name: "Connect Ledger" })).toBeVisible();
    await expect(page.getByText("Balances")).not.toBeVisible();
  });
});
