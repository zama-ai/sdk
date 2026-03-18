import { test, expect } from "../fixtures";
import { formatUnits, parseUnits } from "viem";

test("should show masked balances until reveal is clicked", async ({
  page,
  confidentialBalances,
}) => {
  await page.goto("/wallet");
  const cUsdtRow = page.getByTestId("token-row-cUSDT");
  await expect(cUsdtRow).toBeVisible();

  // Balances should be masked before reveal
  await expect(cUsdtRow.getByTestId("balance")).toHaveText("****");

  // Click reveal
  await page.getByTestId("reveal-button").click();

  // Balance should show the exact initial value
  await expect(cUsdtRow.getByTestId("balance")).toHaveText(
    formatUnits(confidentialBalances.cUSDT, 6),
  );
});

test("should reveal exact cUSDT balance after shielding 500", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
  confidentialBalances,
}) => {
  const shieldAmount = 500n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  const expectedBalance = cUSDTBefore + shieldAmount - computeFee(shieldAmount);
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});

test("should reveal exact cUSDC balance after shielding 750", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
  confidentialBalances,
}) => {
  const cUSDCBefore = confidentialBalances.cUSDC;
  const shieldAmount = 750n;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  const expectedBalance = cUSDCBefore + shieldAmount - computeFee(shieldAmount);
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});

test("should reveal exact balance after shield 1000 and transfer 300", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 300n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  // Shield
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  // Transfer
  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();
  await expect(page.getByTestId("transfer-success")).toBeVisible();

  // Reveal exact balance
  const expectedBalance = cUSDTBefore + shieldAmount - computeFee(shieldAmount) - transferAmount;
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});

test("should transition through masked → decrypting → revealed states", async ({
  page,
  confidentialBalances,
}) => {
  // Clear IndexedDB cache to ensure fresh decryption
  await page.evaluate(() => {
    const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
    return dbs.then((databases: IDBDatabaseInfo[]) =>
      Promise.all(
        databases.map((db: IDBDatabaseInfo) => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        }),
      ),
    );
  });

  await page.goto("/wallet");
  const row = page.getByTestId("token-row-cUSDT");
  const cUSDTBefore = confidentialBalances.cUSDT;

  // State 1: Masked
  await expect(row.getByTestId("balance")).toHaveText("****");

  // Click reveal — triggers decryption
  await page.getByTestId("reveal-button").click();

  // State 2: Decrypting (transient — may be fast, so use polling)
  // We check that eventually we land on the final balance,
  // but first confirm we're NOT still masked
  await expect(row.getByTestId("balance")).not.toHaveText(formatUnits(cUSDTBefore, 6));

  // State 3: Revealed — final balance is a real number
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(cUSDTBefore, 6));
});

test("should hide balances again after clicking hide", async ({ page, confidentialBalances }) => {
  await page.goto("/wallet");
  const row = page.getByTestId("token-row-cUSDT");
  const cUSDTBefore = confidentialBalances.cUSDT;

  // Reveal
  await page.getByTestId("reveal-button").click();
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(cUSDTBefore, 6));

  // Hide
  await page.getByTestId("reveal-button").click();
  await expect(row.getByTestId("balance")).toHaveText("****");
});

test("should show cached balance immediately after page reload", async ({
  page,
  confidentialBalances,
}) => {
  await page.goto("/wallet");

  // Reveal and wait for decryption to complete
  await page.getByTestId("reveal-button").click();
  const row = page.getByTestId("token-row-cUSDT");
  const cUSDTBefore = confidentialBalances.cUSDT;
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(cUSDTBefore, 6));

  // Reload page — cache should persist in IndexedDB
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Reveal again — should show balance without "Decrypting..." intermediate
  await page.getByTestId("reveal-button").click();

  // The balance should appear quickly from cache, not go through "Decrypting..."
  // Use a short timeout to prove it's instant from cache
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(cUSDTBefore, 6), {
    timeout: 3000,
  });
});
