import { describe, expect, test, vi } from "../../test-fixtures";
import { totalSupplyQueryOptions } from "../total-supply";
import type { Address } from "viem";

const WRAPPER = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

describe("totalSupplyQueryOptions", () => {
  test("reads inferredTotalSupply from the wrapper", async ({
    sdk,
    provider,
    mockQueryContext,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(42n);

    const options = totalSupplyQueryOptions(sdk, WRAPPER);
    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(42n);
    expect(options.staleTime).toBe(30_000);
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "inferredTotalSupply", address: WRAPPER }),
    );
  });
});
