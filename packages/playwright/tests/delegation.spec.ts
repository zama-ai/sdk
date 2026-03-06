import { test, expect } from "../fixtures";

test("should delegate decryption to self and decrypt balance as delegate", async ({
  page,
  account,
  contracts,
  confidentialBalances,
}) => {
  // Ensure we have a non-zero confidential balance to decrypt
  const cUSDTBalance = confidentialBalances.cUSDT;
  expect(cUSDTBalance).toBeGreaterThan(0n);

  // Navigate to delegation page with self-delegation params
  await page.goto(
    `/delegation?token=${contracts.cUSDT}&delegate=${account.address}&delegator=${account.address}`,
  );

  // Step 1: Delegate decryption to self
  await page.getByTestId("delegate-button").click();
  await expect(page.getByTestId("delegate-success")).toContainText("Tx: 0x");

  // Step 2: Decrypt balance as delegate (self)
  await page.getByTestId("decrypt-delegate-button").click();
  await expect(page.getByTestId("delegated-balance")).toBeVisible();

  // The decrypted balance should be a number (not empty or error)
  const balanceText = await page.getByTestId("delegated-balance").textContent();
  expect(balanceText).toBeTruthy();
  expect(Number(balanceText)).toBeGreaterThanOrEqual(0);
});
