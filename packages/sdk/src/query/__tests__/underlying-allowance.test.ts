import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress } from "viem";
import { underlyingAllowanceQueryOptions } from "../underlying-allowance";
import { zamaQueryKeys } from "../query-keys";

describe("underlyingAllowanceQueryOptions", () => {
  const UNDERLYING = "0x4444444444444444444444444444444444444444";

  test("enabled false when owner missing", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      { wrapperAddress: "0x3333333333333333333333333333333333333333" },
    );

    expect(options.enabled).toBe(false);
  });

  test("enabled false when wrapperAddress is missing", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
      },
    );

    expect(options.enabled).toBe(false);
  });

  test("queries allowance when owner exists", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const allowance = await options.queryFn(mockQueryContext(options.queryKey));
    expect(allowance).toBe(99n);
  });

  test("includes owner and wrapperAddress in queryKey", ({ signer }) => {
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.underlyingAllowance",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    ]);
  });

  test("queryFn reads tokenAddress, owner, and wrapperAddress from context.queryKey", async ({
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
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
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    await expect(
      options.queryFn(
        mockQueryContext(zamaQueryKeys.underlyingAllowance.scope(options.queryKey[1].tokenAddress)),
      ),
    ).rejects.toThrow("owner is required");
  });
});
