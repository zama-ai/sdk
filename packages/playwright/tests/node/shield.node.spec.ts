import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("Token.shield — wrap ERC-20 into confidential tokens", () => {
  test("shield USDC reduces ERC-20 balance by shield amount", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    const balanceBefore = await readErc20Balance(contracts.USDC);

    const shieldAmount = 100n * 10n ** 6n;
    await token.shield(shieldAmount);

    const balanceAfter = await readErc20Balance(contracts.USDC);
    expect(balanceAfter).toBe(balanceBefore - shieldAmount);
  });

  test("shield USDT reduces ERC-20 balance by shield amount", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const balanceBefore = await readErc20Balance(contracts.USDT);

    const shieldAmount = 200n * 10n ** 6n;
    await token.shield(shieldAmount);

    const balanceAfter = await readErc20Balance(contracts.USDT);
    expect(balanceAfter).toBe(balanceBefore - shieldAmount);
  });

  test("shield twice accumulates correctly", async ({ sdk, contracts, readErc20Balance }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    const balanceBefore = await readErc20Balance(contracts.USDC);

    await token.shield(50n * 10n ** 6n);
    await token.shield(75n * 10n ** 6n);

    const balanceAfter = await readErc20Balance(contracts.USDC);
    expect(balanceAfter).toBe(balanceBefore - 125n * 10n ** 6n);
  });
});
