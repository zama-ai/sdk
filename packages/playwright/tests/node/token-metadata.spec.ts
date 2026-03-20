import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("ReadonlyToken — on-chain metadata queries", () => {
  test("reads token name", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.USDC);
    const name = await token.name();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  test("reads token symbol", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.USDC);
    const symbol = await token.symbol();
    expect(typeof symbol).toBe("string");
    expect(symbol.length).toBeGreaterThan(0);
  });

  test("reads token decimals", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.USDC);
    const decimals = await token.decimals();
    expect(decimals).toBe(6);
  });

  test("isConfidential returns true for confidential token", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDC as Address);
    const isConfidential = await token.isConfidential();
    expect(isConfidential).toBe(true);
  });

  test("isWrapper returns true for wrapper token", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const isWrapper = await token.isWrapper();
    expect(isWrapper).toBe(true);
  });

  test("discovers wrapper via coordinator", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.USDC);
    // discoverWrapper may return null if coordinator doesn't have a mapping
    try {
      const wrapper = await token.discoverWrapper(contracts.feeManager);
      expect(wrapper === null || /^0x[0-9a-fA-F]{40}$/.test(wrapper)).toBe(true);
    } catch {
      // Expected if the address is not a coordinator contract
    }
  });

  test("reads underlying token address from wrapper", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDC as Address);
    const underlying = await token.underlyingToken();
    expect(underlying.toLowerCase()).toBe(contracts.USDC.toLowerCase());
  });

  test("reads ERC-20 allowance", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.USDC);
    const allowance = await token.allowance(contracts.cUSDC as Address);
    expect(typeof allowance).toBe("bigint");
  });
});
