import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  test("uses handle-dependent key and staleTime Infinity", ({ sdk }) => {
    const options = confidentialBalanceQueryOptions(sdk, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false without handle", ({ sdk }) => {
    const options = confidentialBalanceQueryOptions(sdk, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn reads handle from context.queryKey and decrypts via sdk.userDecrypt", async ({
    sdk,
  }) => {
    const handle =
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;
    // Mock sdk.userDecrypt to return the decrypted value
    vi.spyOn(sdk, "userDecrypt").mockResolvedValue({
      [handle]: 42n,
    });

    const options = confidentialBalanceQueryOptions(sdk, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const key = [
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        handle,
      },
    ] as const;

    const value = await options.queryFn(mockQueryContext(key));
    expect(value).toBe(42n);
    expect(sdk.userDecrypt).toHaveBeenCalledWith([
      { handle, contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" },
    ]);
  });
});
