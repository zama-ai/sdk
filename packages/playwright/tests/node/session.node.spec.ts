import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("ZamaSDK — session management (allow / isAllowed / revoke)", () => {
  test("isAllowed returns false before any authorization", async ({ sdk }) => {
    const isAllowed = await sdk.isAllowed();
    expect(isAllowed).toBe(false);
  });

  test("allow authorizes and isAllowed returns true", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address);
    const isAllowed = await sdk.isAllowed();
    expect(isAllowed).toBe(true);
  });

  test("allow multiple tokens in one call", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address, contracts.cUSDC as Address);
    const isAllowed = await sdk.isAllowed();
    expect(isAllowed).toBe(true);
  });

  test("revoke clears session and isAllowed returns false", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address);
    expect(await sdk.isAllowed()).toBe(true);

    await sdk.revoke(contracts.cUSDT as Address);
    expect(await sdk.isAllowed()).toBe(false);
  });

  test("revokeSession clears session without specifying contracts", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address);
    expect(await sdk.isAllowed()).toBe(true);

    await sdk.revokeSession();
    expect(await sdk.isAllowed()).toBe(false);
  });

  test("re-allow after revoke restores session", async ({ sdk, contracts }) => {
    await sdk.allow(contracts.cUSDT as Address);
    await sdk.revoke(contracts.cUSDT as Address);
    expect(await sdk.isAllowed()).toBe(false);

    await sdk.allow(contracts.cUSDC as Address);
    expect(await sdk.isAllowed()).toBe(true);
  });
});

test.describe("ReadonlyToken — per-token allow / isAllowed / revoke", () => {
  test("token isAllowed returns false before authorization", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const isAllowed = await token.isAllowed();
    expect(isAllowed).toBe(false);
  });

  test("token allow authorizes and isAllowed returns true", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    await token.allow();
    const isAllowed = await token.isAllowed();
    expect(isAllowed).toBe(true);
  });

  test("token revoke clears authorization", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    await token.allow();
    expect(await token.isAllowed()).toBe(true);

    await token.revoke(contracts.cUSDT as Address);
    expect(await token.isAllowed()).toBe(false);
  });
});
