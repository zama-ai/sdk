import { test, expect } from "../fixtures";

test("should show not-allowed before any allow call", async ({ page, contracts }) => {
  await page.goto(`/session?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("session-status")).toContainText("Allowed: false");
});

test("should show allowed after allow then not-allowed after revoke", async ({
  page,
  contracts,
}) => {
  await page.goto(`/session?tokens=${contracts.cUSDT},${contracts.cUSDC}`);

  // Allow
  await page.getByTestId("session-allow-button").click();
  await expect(page.getByTestId("session-status")).toContainText("Allowed: true");

  // Revoke
  await page.getByTestId("session-revoke-button").click();
  await expect(page.getByTestId("revoke-success")).toContainText("Revoked successfully");

  // Status should reflect revocation after reload
  await page.goto(`/session?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("session-status")).toContainText("Allowed: false");
});

test("should show not-allowed after revokeSession", async ({ page, contracts }) => {
  await page.goto(`/session?tokens=${contracts.cUSDT},${contracts.cUSDC}`);

  // Allow first
  await page.getByTestId("session-allow-button").click();
  await expect(page.getByTestId("session-status")).toContainText("Allowed: true");

  // Revoke session
  await page.getByTestId("session-revoke-session-button").click();
  await expect(page.getByTestId("revoke-session-success")).toContainText(
    "Session revoked successfully",
  );

  // Status should reflect revocation after reload
  await page.goto(`/session?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await expect(page.getByTestId("session-status")).toContainText("Allowed: false");
});
