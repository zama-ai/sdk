import type { Address } from "viem";
import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

  test("query key includes tokenAddress and owner (no handle)", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      owner,
    });

    expect(options.queryKey).toEqual(["zama.confidentialBalance", { tokenAddress, owner }]);
  });

  test("refetchInterval defaults to 10_000 and can be overridden", ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const defaults = confidentialBalanceQueryOptions(token, { tokenAddress, owner });
    const custom = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      owner,
      pollingInterval: 5_000,
    });

    expect(defaults.refetchInterval).toBe(10_000);
    expect(custom.refetchInterval).toBe(5_000);
  });

  test("enabled defaults to true", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, { tokenAddress });

    expect(options.enabled).toBe(true);
  });

  test("enabled is false when query.enabled is false", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to token.balanceOf using the owner from queryKey", async ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(tokenAddress);
    vi.mocked(token.balanceOf).mockResolvedValue(42n);

    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      owner,
    });

    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(42n);
    expect(token.balanceOf).toHaveBeenCalledWith(owner);
  });

  test("queryFn passes undefined owner through to token.balanceOf when none is configured", async ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(tokenAddress);
    vi.mocked(token.balanceOf).mockResolvedValue(7n);

    const options = confidentialBalanceQueryOptions(token, { tokenAddress });

    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(7n);
    expect(token.balanceOf).toHaveBeenCalledWith(undefined);
  });
});
