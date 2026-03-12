import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress } from "viem";
import { underlyingAllowanceQueryOptions } from "../underlying-allowance";
import { zamaQueryKeys } from "../query-keys";

describe("underlyingAllowanceQueryOptions", () => {
  const UNDERLYING = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D";

  test("enabled false when owner missing", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      { wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" },
    );

    expect(options.enabled).toBe(false);
  });

  test("enabled false when wrapperAddress is missing", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      },
    );

    expect(options.enabled).toBe(false);
  });

  test("queries allowance when owner exists", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const allowance = await options.queryFn(mockQueryContext(options.queryKey));
    expect(allowance).toBe(99n);
  });

  test("includes owner and wrapperAddress in queryKey", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.underlyingAllowance",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    ]);
  });

  test("queryFn reads tokenAddress, owner, and wrapperAddress from context.queryKey", async ({
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const key = zamaQueryKeys.underlyingAllowance.scope(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );

    await options.queryFn(mockQueryContext(key));

    expect(vi.mocked(signer.readContract)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: getAddress("0xcccccccccccccccccccccccccccccccccccccccc"),
        functionName: "underlying",
        args: [],
      }),
    );
    expect(vi.mocked(signer.readContract)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        address: getAddress(UNDERLYING),
        functionName: "allowance",
        args: [
          getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
          getAddress("0xcccccccccccccccccccccccccccccccccccccccc"),
        ],
      }),
    );
  });

  test("queryFn throws when params are missing from context.queryKey", async ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        wrapperAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    await expect(
      options.queryFn(
        mockQueryContext(zamaQueryKeys.underlyingAllowance.scope(options.queryKey[1].tokenAddress)),
      ),
    ).rejects.toThrow("owner is required");
  });
});
