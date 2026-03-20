import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

test.describe("Token — transfer prerequisites", () => {
  test("shield does not affect ERC-20 balance visible to recipient", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const recipientBalanceBefore = await readErc20Balance(contracts.USDT, recipient);

    await token.shield(1000n * 10n ** 6n);

    const recipientBalanceAfter = await readErc20Balance(contracts.USDT, recipient);
    expect(recipientBalanceAfter).toBe(recipientBalanceBefore);
  });
});
