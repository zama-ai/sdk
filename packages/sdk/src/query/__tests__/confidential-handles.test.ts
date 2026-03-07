import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { confidentialHandlesQueryOptions } from "../confidential-handles";
import { zamaQueryKeys } from "../query-keys";

describe("confidentialHandlesQueryOptions", () => {
  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x3333333333333333333333333333333333333333";
  const owner = "0x2222222222222222222222222222222222222222";

  test("uses expected query key shape", ({ signer }) => {
    const options = confidentialHandlesQueryOptions(signer, [tokenA, tokenB], { owner });

    expect(options.queryKey).toEqual([
      "zama.confidentialHandles",
      { tokenAddresses: [tokenA, tokenB], owner },
    ]);
  });

  test("defaults refetchInterval to 10000 and allows override", ({ signer }) => {
    const defaults = confidentialHandlesQueryOptions(signer, [tokenA], { owner });
    const custom = confidentialHandlesQueryOptions(signer, [tokenA], {
      owner,
      pollingInterval: 2500,
    });

    expect(defaults.refetchInterval).toBe(10_000);
    expect(custom.refetchInterval).toBe(2500);
  });

  test("enabled is false when owner is missing", ({ signer }) => {
    const options = confidentialHandlesQueryOptions(signer, [tokenA], {});

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when tokenAddresses is empty", ({ signer }) => {
    const options = confidentialHandlesQueryOptions(signer, [], { owner });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ signer }) => {
    const options = confidentialHandlesQueryOptions(signer, [tokenA], {
      owner,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn extracts params from context.queryKey and reads each token handle", async ({
    signer,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb");

    const options = confidentialHandlesQueryOptions(signer, [tokenA], { owner });
    const key = zamaQueryKeys.confidentialHandles.tokens(
      [tokenA, tokenB],
      "0x4444444444444444444444444444444444444444",
    );

    await options.queryFn(mockQueryContext(key));

    const calls = vi.mocked(signer.readContract).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toMatchObject({
      address: tokenA,
      functionName: "confidentialBalanceOf",
      args: ["0x4444444444444444444444444444444444444444"],
    });
    expect(calls[1]?.[0]).toMatchObject({
      address: tokenB,
      functionName: "confidentialBalanceOf",
      args: ["0x4444444444444444444444444444444444444444"],
    });
  });
});
