import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("ZamaSDK.allow — pre-authorize multiple tokens", () => {
  test("allow all tokens in a single call", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address, contracts.cUSDC as Address);
    const isAllowed = await sdk.isAllowed();
    expect(isAllowed).toBe(true);
  });
});
