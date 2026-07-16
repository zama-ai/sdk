import { test, expect } from "../fixtures";

// useWrap is the low-level escape hatch that splits shield into two signatures:
// approveUnderlying() then wrap(). This exercises that flow end-to-end against
// USDT/cUSDT (the approve+wrap path, since USDT is not ERC-1363).
test("should approve and wrap USDT into confidential balance", async ({
  page,
  contracts,
  formatUnits,
  readErc20Balance,
  confidentialBalances,
}) => {
  const wrapAmount = 1000n;

  const usdtBefore = await readErc20Balance(contracts.USDT);
  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/wrap-manual?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);

  // Step 1: approve the wrapper to spend the underlying ERC-20.
  await page.getByTestId("approve-amount-input").fill("1000");
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("approve-success")).toContainText("Tx: 0x");

  // Step 2: wrap the approved amount into confidential tokens.
  await page.getByTestId("wrap-amount-input").fill("1000");
  await page.getByTestId("wrap-button").click();
  await expect(page.getByTestId("wrap-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + wrapAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should decrease by the wrap amount
  await expect(page.getByTestId("token-row-USDT").getByTestId("balance")).toHaveText(
    formatUnits(usdtBefore - wrapAmount, 6),
  );

  // On-chain: ERC-20 balance should have decreased by wrap amount
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(usdtBefore - wrapAmount);
});

test("should surface an error when wrapping more than the approved allowance", async ({
  page,
  contracts,
}) => {
  await page.goto(`/wrap-manual?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);

  // Approve only a small allowance...
  await page.getByTestId("approve-amount-input").fill("100");
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("approve-success")).toContainText("Tx: 0x");

  // ...then attempt to wrap more than that. The SDK validates the allowance
  // (public read, no signing) and fails early with InsufficientAllowanceError.
  await page.getByTestId("wrap-amount-input").fill("1000");
  await page.getByTestId("wrap-button").click();
  // Assert it's specifically the allowance error, not any error — the balance
  // check runs first, so a low-balance wallet would otherwise pass this test.
  await expect(page.getByTestId("wrap-error")).toContainText("allowance");
});
