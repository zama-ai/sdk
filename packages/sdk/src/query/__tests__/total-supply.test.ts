import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { totalSupplyQueryOptions } from "../total-supply";

describe("totalSupplyQueryOptions", () => {
  test("queries total supply with 30s stale time", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(42n);

    const options = totalSupplyQueryOptions(signer, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(42n);
    expect(options.staleTime).toBe(30_000);
  });
});
