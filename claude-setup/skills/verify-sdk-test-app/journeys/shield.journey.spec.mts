/// <reference types="node" />
// Shield journey for the verify-sdk-test-app skill (feature map: features/shield.md).
// Drives the user path wallet -> Shield -> wallet and records screen and chain evidence in
// $VERIFY_EVIDENCE_DIR/journeys/shield/. Run: scripts/verify.sh run --project=journeys shield
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type * as Fixtures from "../../../../test/playwright/fixtures/index.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Run journeys through scripts/verify.sh run.`);
  }
  return value;
}

// Load the fixtures of the checkout under test (the one verify.sh runs Playwright from), so the
// spec and the CLI share one @playwright/test copy. The fixtures connect the burner wallet, mint
// 1000 USDT and USDC to anvil account #0, and revert the chain after the test.
const { test, expect }: typeof Fixtures = await import(
  `${requireEnv("VERIFY_REPO_ROOT")}/test/playwright/fixtures/index.ts`
);

const SHIELD_UNITS = 250_000n; // 0.25 USDT (6 decimals)

function toUnits(text: string, decimals = 6): bigint {
  const [whole, fraction = ""] = text.trim().split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

test("shield USDT from the wallet row; balances move on screen and on chain", async ({
  page,
  contracts,
  account,
  viemClient,
  readErc20Balance,
  formatUnits,
}) => {
  const dir = join(requireEnv("VERIFY_EVIDENCE_DIR"), "journeys", "shield");
  mkdirSync(dir, { recursive: true });
  const shot = (name: string) =>
    page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  const aria = async (name: string) =>
    writeFileSync(join(dir, `${name}.aria.yml`), await page.locator("main").ariaSnapshot());

  const sidebar = page.getByRole("complementary");
  const usdtRow = page.getByTestId("token-row-USDT");
  const cUsdtRow = page.getByTestId("token-row-cUSDT");

  // Entry point 1: the sidebar "Shield" link opens the form for the default pair (USDT -> cUSDT).
  await sidebar.getByRole("link", { name: "Shield", exact: true }).click();
  await expect(page).toHaveURL(/\/shield$/);
  await expect(page.getByRole("heading", { name: "Shield USDT" })).toBeVisible();
  await shot("0-sidebar-entry");

  // Before: public balance on chain and on screen, confidential balance decrypted on screen.
  const usdtBefore = await readErc20Balance(contracts.USDT);
  await sidebar.getByRole("link", { name: "Wallet", exact: true }).click();
  await expect(cUsdtRow.getByTestId("balance")).toHaveText("****");
  await page.getByTestId("reveal-button").click();
  await expect(cUsdtRow.getByTestId("balance")).toHaveText(/^\d/);
  await expect(usdtRow.getByTestId("balance")).toHaveText(formatUnits(usdtBefore, 6));
  const cUsdtBefore = toUnits(await cUsdtRow.getByTestId("balance").innerText());
  await shot("1-wallet-before");

  // Entry point 2: the USDT row's "Shield" link carries the token and wrapper in the URL.
  await usdtRow.getByRole("link", { name: "Shield" }).click();
  await expect(page).toHaveURL(
    new RegExp(`token=${contracts.USDT}&wrapper=${contracts.cUSDT}`, "i"),
  );
  await expect(page.getByRole("heading", { name: "Shield USDT" })).toBeVisible();
  await page.getByTestId("amount-input").fill(SHIELD_UNITS.toString());
  await shot("2-shield-form-filled");
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText(/Tx: 0x[0-9a-f]{64}/i);
  await shot("3-shield-success");
  const hashMatch = (await page.getByTestId("shield-success").innerText()).match(
    /0x[0-9a-fA-F]{64}/,
  );
  if (!hashMatch) {
    throw new Error("shield-success shows no tx hash");
  }
  const txHash = hashMatch[0] as `0x${string}`;

  // Side effect on chain: the reported tx mined successfully and the ERC-20 left the wallet.
  const receipt = await viemClient.getTransactionReceipt({ hash: txHash });
  expect(receipt.status).toBe("success");
  const usdtAfter = await readErc20Balance(contracts.USDT);
  expect(usdtAfter).toBe(usdtBefore - SHIELD_UNITS);

  // After: a fresh reveal decrypts the new confidential balance.
  await sidebar.getByRole("link", { name: "Wallet", exact: true }).click();
  await expect(cUsdtRow.getByTestId("balance")).toHaveText("****");
  await page.getByTestId("reveal-button").click();
  await expect(cUsdtRow.getByTestId("balance")).toHaveText(
    formatUnits(cUsdtBefore + SHIELD_UNITS, 6),
  );
  await expect(usdtRow.getByTestId("balance")).toHaveText(formatUnits(usdtAfter, 6));
  await shot("4-wallet-after");
  await aria("4-wallet-after");

  writeFileSync(
    join(dir, "summary.json"),
    JSON.stringify(
      {
        feature: "shield",
        app: process.env.VERIFY_APP,
        baseURL: process.env.VERIFY_BASE_URL,
        account: account.address,
        token: contracts.USDT,
        wrapper: contracts.cUSDT,
        shieldUnits: SHIELD_UNITS.toString(),
        txHash,
        receipt: {
          status: receipt.status,
          blockNumber: receipt.blockNumber.toString(),
          to: receipt.to,
          logs: receipt.logs.length,
        },
        erc20OnChain: { before: usdtBefore.toString(), after: usdtAfter.toString() },
        confidentialOnScreen: {
          before: cUsdtBefore.toString(),
          after: (cUsdtBefore + SHIELD_UNITS).toString(),
        },
      },
      null,
      2,
    ),
  );
});
