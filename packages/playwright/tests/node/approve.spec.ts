import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("Token.approveUnderlying — ERC-20 approval for shield", () => {
  test("approves wrapper to spend underlying tokens", async ({ sdk, contracts }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    const result = await token.approveUnderlying(1000n * 10n ** 6n);
    expect(result).toBeDefined();
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  test("approves max uint256 by default", async ({ sdk, contracts }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    const result = await token.approveUnderlying();
    expect(result).toBeDefined();
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});

// NOTE: Token.approve (confidential operator approval) and isApproved require
// valid encrypted input proofs that pass on-chain ACL verification.
// These are covered by the browser e2e tests in tests/approve.spec.ts.
