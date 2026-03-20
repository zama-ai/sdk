/**
 * Scenario: Tests encrypt, userDecrypt, and publicDecrypt operations via
 * RelayerNode backed by the RelayerCleartext mock worker.
 *
 * These were previously blocked by the coprocessor dependency — now unblocked
 * by replacing MockFhevmInstance with RelayerCleartext in the mock worker.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test("encrypt produces handles and inputProof", async ({ relayer, account, contracts }) => {
  const result = await relayer.encrypt({
    values: [{ value: 42n, type: "euint64" }],
    contractAddress: contracts.cUSDT,
    userAddress: account.address,
  });

  expect(result.handles).toHaveLength(1);
  expect(result.handles[0]).toBeInstanceOf(Uint8Array);
  expect(result.handles[0]!.length).toBe(32);
  expect(result.inputProof).toBeInstanceOf(Uint8Array);
  expect(result.inputProof.length).toBeGreaterThan(0);
});

test("encrypt multiple values produces matching handles", async ({
  relayer,
  account,
  contracts,
}) => {
  const result = await relayer.encrypt({
    values: [
      { value: 100n, type: "euint64" },
      { value: 200n, type: "euint64" },
      { value: true, type: "ebool" },
    ],
    contractAddress: contracts.cUSDT,
    userAddress: account.address,
  });

  expect(result.handles).toHaveLength(3);
  // All handles should be unique
  const hexHandles = result.handles.map((h) => Buffer.from(h).toString("hex"));
  expect(new Set(hexHandles).size).toBe(3);
});

test("shield then userDecrypt reveals correct balance", async ({ sdk, contracts, computeFee }) => {
  const shieldAmount = 500n * 10n ** 6n;

  // Allow session first (needed for balanceOf / userDecrypt)
  await sdk.allow(contracts.cUSDT as Address);

  // Read baseline balance before shield
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const balanceBefore = await readonlyToken.balanceOf();

  // Shield
  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Decrypt and verify increase
  const balanceAfter = await readonlyToken.balanceOf();
  const expectedIncrease = shieldAmount - computeFee(shieldAmount);
  expect(balanceAfter - balanceBefore).toBe(expectedIncrease);
});

test("shield USDC then userDecrypt reveals correct balance", async ({
  sdk,
  contracts,
  computeFee,
}) => {
  const shieldAmount = 750n * 10n ** 6n;

  await sdk.allow(contracts.cUSDC as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDC as Address);
  const balanceBefore = await readonlyToken.balanceOf();

  const token = sdk.createToken(contracts.cUSDC as Address);
  await token.shield(shieldAmount);

  const balanceAfter = await readonlyToken.balanceOf();
  expect(balanceAfter - balanceBefore).toBe(shieldAmount - computeFee(shieldAmount));
});

test("shield, transfer, then decrypt shows reduced balance", async ({
  sdk,
  contracts,
  computeFee,
}) => {
  const shieldAmount = 1000n * 10n ** 6n;
  const transferAmount = 300n * 10n ** 6n;
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

  await sdk.allow(contracts.cUSDT as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const balanceBefore = await readonlyToken.balanceOf();

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);
  await token.confidentialTransfer(recipient, transferAmount);

  const balanceAfter = await readonlyToken.balanceOf();
  const expectedDelta = shieldAmount - computeFee(shieldAmount) - transferAmount;
  expect(balanceAfter - balanceBefore).toBe(expectedDelta);
});

test("shield then unshield returns correct ERC-20 balance", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
}) => {
  const shieldAmount = 1000n * 10n ** 6n;
  const unshieldAmount = 400n * 10n ** 6n;

  const usdtBefore = await readErc20Balance(contracts.USDT);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);
  await token.unshield(unshieldAmount);

  const usdtAfter = await readErc20Balance(contracts.USDT);
  const expectedErc20 = usdtBefore - shieldAmount + unshieldAmount - computeFee(unshieldAmount);
  expect(usdtAfter).toBe(expectedErc20);
});
