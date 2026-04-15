import type { Address } from "viem";
import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
  const handle =
    "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

  test("includes handle and owner in the query key (cache identity) and uses staleTime Infinity", ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      owner,
      handle,
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress,
        owner,
        handle,
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled defaults to true (handle/owner are cache-key only, not gates)", ({
    createMockReadonlyToken,
  }) => {
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
      handle,
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
