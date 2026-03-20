/**
 * Journey: A user shields ERC-20 tokens into confidential wrappers,
 * then queries the resulting on-chain state.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test("shield USDT, verify ERC-20 decrease and confidential handle", async ({
  sdk,
  contracts,
  readErc20Balance,
}) => {
  const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const usdtBefore = await readErc20Balance(contracts.USDT);

  await token.shield(1000n * 10n ** 6n);

  // ERC-20 balance decreased
  expect(await readErc20Balance(contracts.USDT)).toBe(usdtBefore - 1000n * 10n ** 6n);

  // Confidential handle is non-zero
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const handle = await readonlyToken.confidentialBalanceOf();
  expect(handle).not.toBe("0x" + "0".repeat(64));
});

test("shield USDC, verify ERC-20 decrease and confidential handle", async ({
  sdk,
  contracts,
  readErc20Balance,
}) => {
  const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  const usdcBefore = await readErc20Balance(contracts.USDC);

  await token.shield(1000n * 10n ** 6n);

  expect(await readErc20Balance(contracts.USDC)).toBe(usdcBefore - 1000n * 10n ** 6n);

  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDC as Address);
  const handle = await readonlyToken.confidentialBalanceOf();
  expect(handle).not.toBe("0x" + "0".repeat(64));
});

test("shield twice accumulates correctly", async ({ sdk, contracts, readErc20Balance }) => {
  const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  const before = await readErc20Balance(contracts.USDC);

  await token.shield(50n * 10n ** 6n);
  await token.shield(75n * 10n ** 6n);

  expect(await readErc20Balance(contracts.USDC)).toBe(before - 125n * 10n ** 6n);
});

test("shield does not affect recipient ERC-20 balance", async ({
  sdk,
  contracts,
  readErc20Balance,
}) => {
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
  const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const recipientBefore = await readErc20Balance(contracts.USDT, recipient);

  await token.shield(1000n * 10n ** 6n);

  expect(await readErc20Balance(contracts.USDT, recipient)).toBe(recipientBefore);
});
