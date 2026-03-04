import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { totalSupplyQueryOptions } from "../total-supply";

describe("totalSupplyQueryOptions", () => {
  test("queries total supply with 30s stale time", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(42n);

    const options = totalSupplyQueryOptions(signer, "0x1111111111111111111111111111111111111111");
    const value = await options.queryFn({ queryKey: options.queryKey });

    expect(value).toBe(42n);
    expect(options.staleTime).toBe(30_000);
  });
});
