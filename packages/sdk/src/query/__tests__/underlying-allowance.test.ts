import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress } from "viem";
import { underlyingAllowanceQueryOptions } from "../underlying-allowance";
import { zamaQueryKeys } from "../query-keys";

describe("underlyingAllowanceQueryOptions", () => {
  const UNDERLYING = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D";
  const WRAPPER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C";
  const OWNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";

  test("enabled false when owner missing", ({ sdk }) => {
    const options = underlyingAllowanceQueryOptions(sdk, WRAPPER, {});

    expect(options.enabled).toBe(false);
  });

  test("queries allowance when owner exists", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(sdk, WRAPPER, { owner: OWNER });

    const allowance = await options.queryFn(mockQueryContext(options.queryKey));
    expect(allowance).toBe(99n);
  });

  test("includes tokenAddress and owner in queryKey", ({ sdk }) => {
    const options = underlyingAllowanceQueryOptions(sdk, WRAPPER, { owner: OWNER });

    expect(options.queryKey).toEqual([
      "zama.underlyingAllowance",
      {
        tokenAddress: getAddress(WRAPPER),
        owner: getAddress(OWNER),
      },
    ]);
  });

  test("queryFn reads tokenAddress and owner from context.queryKey", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(sdk, WRAPPER, { owner: OWNER });

    const key = zamaQueryKeys.underlyingAllowance.scope(WRAPPER, OWNER);

    await options.queryFn(mockQueryContext(key));

    expect(vi.mocked(provider.readContract)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: getAddress(WRAPPER),
        functionName: "underlying",
        args: [],
      }),
    );
    expect(vi.mocked(provider.readContract)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        address: getAddress(UNDERLYING),
        functionName: "allowance",
        args: [getAddress(OWNER), getAddress(WRAPPER)],
      }),
    );
  });

  test("queryFn throws when owner is missing from context.queryKey", async ({ sdk }) => {
    const options = underlyingAllowanceQueryOptions(sdk, WRAPPER, { owner: OWNER });

    await expect(
      options.queryFn(
        mockQueryContext(zamaQueryKeys.underlyingAllowance.scope(options.queryKey[1].tokenAddress)),
      ),
    ).rejects.toThrow("underlyingAllowanceQueryOptions: owner must not be null or undefined");
  });
});
