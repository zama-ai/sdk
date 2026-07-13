import { test, expect } from "../fixtures";

test("should show not-allowed before any allow call", async ({ page, contracts }) => {
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: false");
});

test("should show allowed after allow then not-allowed after revoke", async ({
  page,
  contracts,
}) => {
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);

  // Allow
  await page.getByTestId("permits-allow-button").click();
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: true");

  // Revoke
  await page.getByTestId("permits-revoke-button").click();
  await expect(page.getByTestId("revoke-success")).toContainText("Revoked successfully");

  // Status should reflect revocation after reload
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: false");
});

test("should show not-allowed after clearing stored credentials", async ({ page, contracts }) => {
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);

  // Allow first
  await page.getByTestId("permits-allow-button").click();
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: true");

  // Clearing credentials wipes the local keypair and permits
  await page.getByTestId("permits-clear-credentials-button").click();
  await expect(page.getByTestId("clear-credentials-success")).toContainText(
    "Credentials cleared successfully",
  );

  // Status should reflect the cleared credentials after reload
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: false");
});

test("should show not-allowed after revoking all permits", async ({ page, contracts }) => {
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);

  // Allow first
  await page.getByTestId("permits-allow-button").click();
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: true");

  // Revoke all permits
  await page.getByTestId("permits-revoke-all-button").click();
  await expect(page.getByTestId("revoke-all-success")).toContainText(
    "All permits revoked successfully",
  );

  // Status should reflect revocation after reload
  await page.goto(`/permits?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("permits-status")).toContainText("Allowed: false");
});
