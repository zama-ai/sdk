import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

// NOTE: Token.unshield, unwrap, and finalizeUnwrap require valid encrypted
// input proofs that pass on-chain ACL verification. The mock worker produces
// handles that are rejected by the smart contracts.
// These flows are covered by the browser e2e tests in tests/unshield.spec.ts
// and tests/unwrap-manual.spec.ts.

test.describe("Token — unshield prerequisites", () => {
  test("shield provides tokens that can later be unshielded (via browser e2e)", async ({
    sdk,
    contracts,
    readErc20Balance,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const balanceBefore = await readErc20Balance(contracts.USDT);

    await token.shield(100n * 10n ** 6n);

    const balanceAfter = await readErc20Balance(contracts.USDT);
    expect(balanceAfter).toBeLessThan(balanceBefore);
  });
});
