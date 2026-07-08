import { encodeAbiParameters } from "viem";
import { expect, test } from "../fixtures";

// abi.encode(uint8(1)) — ERC7984ReceiverMock decodes data as uint8 and emits
// ConfidentialTransferCallback(true) when it equals 1. Anything > 1 reverts.
const SUCCESS_DATA = encodeAbiParameters([{ type: "uint8" }], [1]);
const REVERT_DATA = encodeAbiParameters([{ type: "uint8" }], [2]);

test("transferAndCall to the receiver mock succeeds and moves the balance", async ({
  page,
  contracts,
  formatUnits,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 500n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/transfer-and-call?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(contracts.confidentialReceiver);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("data-input").fill(SUCCESS_DATA);
  await page.getByTestId("transfer-and-call-button").click();

  await expect(page.getByTestId("transfer-and-call-success")).toContainText("Tx: 0x");

  // Confidential balance dropped by the transfer amount.
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount - transferAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});

test("transferAndCall surfaces a revert from the receiver hook", async ({ page, contracts }) => {
  await page.goto(`/transfer-and-call?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(contracts.confidentialReceiver);
  await page.getByTestId("amount-input").fill("1");
  // abi.encode(uint8(2)) — receiver mock reverts with InvalidInput(2).
  await page.getByTestId("data-input").fill(REVERT_DATA);
  await page.getByTestId("transfer-and-call-button").click();

  await expect(page.getByTestId("transfer-and-call-error")).toBeVisible();
});
