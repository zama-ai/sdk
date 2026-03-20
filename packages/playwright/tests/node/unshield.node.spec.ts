import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("Token — unshield prerequisites", () => {
  test("shield is the prerequisite for unshield", async ({ sdk, contracts, readErc20Balance }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const balanceBefore = await readErc20Balance(contracts.USDT);

    await token.shield(100n * 10n ** 6n);

    const balanceAfter = await readErc20Balance(contracts.USDT);
    expect(balanceAfter).toBeLessThan(balanceBefore);
  });
});
