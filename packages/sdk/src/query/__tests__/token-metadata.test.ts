import { describe, expect, test, vi } from "../../test-fixtures";
import { tokenMetadataQueryOptions } from "../token-metadata";

describe("tokenMetadataQueryOptions", () => {
  test("returns stable key and staleTime Infinity", ({ signer }) => {
    const options = tokenMetadataQueryOptions(signer, "0x1111111111111111111111111111111111111111");

    expect(options.queryKey).toEqual([
      "zama.tokenMetadata",
      { tokenAddress: "0x1111111111111111111111111111111111111111" },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("queryFn reads token address from context.queryKey", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("Name")
      .mockResolvedValueOnce("SYM")
      .mockResolvedValueOnce(18);

    const options = tokenMetadataQueryOptions(signer, "0x1111111111111111111111111111111111111111");
    const otherKey = [
      "zama.tokenMetadata",
      { tokenAddress: "0x2222222222222222222222222222222222222222" },
    ] as const;
    const result = await options.queryFn({ queryKey: otherKey });

    expect(result).toEqual({ name: "Name", symbol: "SYM", decimals: 18 });
    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x2222222222222222222222222222222222222222",
      functionName: "name",
    });
  });
});
