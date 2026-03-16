import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { confidentialHandleQueryOptions } from "../confidential-handle";

describe("confidentialHandleQueryOptions", () => {
  test("defaults refetchInterval to 10000 and can be overridden", ({ signer }) => {
    const defaults = confidentialHandleQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      { owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" },
    );
    const custom = confidentialHandleQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        pollingInterval: 2500,
      },
    );

    expect(defaults.refetchInterval).toBe(10_000);
    expect(custom.refetchInterval).toBe(2500);
  });

  test("queryFn extracts owner + tokenAddress from context.queryKey", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    const options = confidentialHandleQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      { owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" },
    );

    const queryKey = [
      "zama.confidentialHandle",
      {
        tokenAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
        owner: "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
      },
    ] as const;

    await options.queryFn(mockQueryContext(queryKey));

    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      functionName: "confidentialBalanceOf",
      args: ["0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D"],
    });
  });

  test("enabled is false when owner missing", ({ signer }) => {
    const options = confidentialHandleQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {},
    );

    expect(options.enabled).toBe(false);
  });
});
