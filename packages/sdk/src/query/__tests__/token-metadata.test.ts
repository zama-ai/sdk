import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { tokenMetadataQueryOptions } from "../token-metadata";

describe("tokenMetadataQueryOptions", () => {
  test("returns stable key and staleTime Infinity", ({ signer }) => {
    const options = tokenMetadataQueryOptions(signer, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    expect(options.queryKey).toEqual([
      "zama.tokenMetadata",
      { tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("queryFn reads token address from context.queryKey", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("Name")
      .mockResolvedValueOnce("SYM")
      .mockResolvedValueOnce(18);

    const options = tokenMetadataQueryOptions(signer, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    const otherKey = [
      "zama.tokenMetadata",
      { tokenAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" },
    ] as const;
    const result = await options.queryFn(mockQueryContext(otherKey));

    expect(result).toEqual({ name: "Name", symbol: "SYM", decimals: 18 });
    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      functionName: "name",
    });
  });
});
