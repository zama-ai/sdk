/**
 * Scenario: A user shields tokens, then exercises every confidential transfer
 * variant — self-transfer, operator-driven transferFrom, and full-balance transfer.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

test("transfer to self preserves balance", async ({ sdk, contracts }) => {
  const shieldAmount = 500n * 10n ** 6n;
  const transferAmount = 200n * 10n ** 6n;

  await sdk.allow(contracts.cUSDT as Address);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const balanceAfterShield = await readonlyToken.balanceOf();

  // Transfer to self — balance should remain unchanged
  const signerAddress = await sdk.signer.getAddress();
  await token.confidentialTransfer(signerAddress, transferAmount);

  const balanceAfterSelfTransfer = await readonlyToken.balanceOf();
  expect(balanceAfterSelfTransfer).toBe(balanceAfterShield);
});

test("approve operator → transferFrom succeeds", async ({ sdk, contracts, computeFee }) => {
  const shieldAmount = 1000n * 10n ** 6n;
  const transferAmount = 300n * 10n ** 6n;

  await sdk.allow(contracts.cUSDT as Address);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Approve the recipient as an operator
  const approveResult = await token.approve(RECIPIENT);
  expect(approveResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // Verify approval
  expect(await token.isApproved(RECIPIENT)).toBe(true);

  // Use transferFrom (operator-initiated transfer)
  const signerAddress = await sdk.signer.getAddress();
  await token.confidentialTransferFrom(signerAddress, RECIPIENT, transferAmount);

  // Sender balance decreased
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const senderBalance = await readonlyToken.balanceOf();
  const expected = shieldAmount - computeFee(shieldAmount) - transferAmount;
  expect(senderBalance).toBe(expected);
});

test("transfer entire shielded balance leaves zero", async ({ sdk, contracts }) => {
  const shieldAmount = 500n * 10n ** 6n;

  await sdk.allow(contracts.cUSDT as Address);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const netBalance = await readonlyToken.balanceOf();

  // Transfer the full net amount
  await token.confidentialTransfer(RECIPIENT, netBalance);

  const finalBalance = await readonlyToken.balanceOf();
  expect(finalBalance).toBe(0n);
});

test("multiple sequential transfers accumulate correctly at recipient", async ({
  sdk,
  contracts,
  computeFee,
}) => {
  const shieldAmount = 1000n * 10n ** 6n;
  const transfer1 = 100n * 10n ** 6n;
  const transfer2 = 200n * 10n ** 6n;
  const transfer3 = 150n * 10n ** 6n;

  await sdk.allow(contracts.cUSDT as Address);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  await token.confidentialTransfer(RECIPIENT, transfer1);
  await token.confidentialTransfer(RECIPIENT, transfer2);
  await token.confidentialTransfer(RECIPIENT, transfer3);

  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const senderBalance = await readonlyToken.balanceOf();
  const expectedSender =
    shieldAmount - computeFee(shieldAmount) - transfer1 - transfer2 - transfer3;
  expect(senderBalance).toBe(expectedSender);
});
