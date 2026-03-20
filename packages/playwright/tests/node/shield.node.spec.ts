import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("Token.shield — wrap ERC-20 into confidential tokens", () => {
  test("shield USDT and verify ERC-20 balance decrease", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const shieldAmount = 1000n * 10n ** 6n;
    const usdtBefore = await readErc20Balance(contracts.USDT);

    await token.shield(shieldAmount);

    const usdtAfter = await readErc20Balance(contracts.USDT);
    expect(usdtAfter).toBe(usdtBefore - shieldAmount);
  });

  test("shield USDC and verify ERC-20 balance decrease", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    const shieldAmount = 1000n * 10n ** 6n;
    const usdcBefore = await readErc20Balance(contracts.USDC);

    await token.shield(shieldAmount);

    const usdcAfter = await readErc20Balance(contracts.USDC);
    expect(usdcAfter).toBe(usdcBefore - shieldAmount);
  });

  test("shield twice accumulates correctly", async ({ sdk, contracts, readErc20Balance }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    const balanceBefore = await readErc20Balance(contracts.USDC);

    await token.shield(50n * 10n ** 6n);
    await token.shield(75n * 10n ** 6n);

    const balanceAfter = await readErc20Balance(contracts.USDC);
    expect(balanceAfter).toBe(balanceBefore - 125n * 10n ** 6n);
  });

  test("shield produces non-zero confidential balance handle", async ({ sdk, contracts }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    await token.shield(500n * 10n ** 6n);

    const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const handle = await readonlyToken.confidentialBalanceOf();
    expect(handle).not.toBe("0x" + "0".repeat(64));
  });
});
