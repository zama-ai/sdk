import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress } from "viem";
import { confidentialIsApprovedQueryOptions } from "../confidential-is-approved";
import { zamaQueryKeys } from "../query-keys";

describe("confidentialIsApprovedQueryOptions", () => {
  test("stays enabled with a resolved holder", ({ sdk }) => {
    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    expect(options.enabled).toBe(true);
  });

  test("is disabled when holder or spender is missing", ({ sdk }) => {
    const missingHolder = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );
    const missingSpender = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      },
    );

    expect(missingHolder.enabled).toBe(false);
    expect(missingSpender.enabled).toBe(false);
  });

  test("is disabled when tokenAddress is missing", ({ sdk }) => {
    const options = confidentialIsApprovedQueryOptions(sdk, undefined, {
      holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual([
      "zama.confidentialIsApproved",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    ]);
  });

  test("checks operator approval", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const isApproved = await options.queryFn(mockQueryContext(options.queryKey));
    expect(isApproved).toBe(true);
  });

  test("includes holder and spender in queryKey", ({ sdk }) => {
    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.confidentialIsApproved",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    ]);
  });

  test("queryFn reads tokenAddress, holder, and spender from context.queryKey", async ({
    sdk,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const key = zamaQueryKeys.confidentialIsApproved.scope(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );

    await options.queryFn(mockQueryContext(key));

    expect(vi.mocked(provider.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        address: getAddress("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"),
        functionName: "isOperator",
        args: [
          getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
          getAddress("0xcccccccccccccccccccccccccccccccccccccccc"),
        ],
      }),
    );
  });

  test("queryFn uses the resolved holder without querying the signer", async ({
    sdk,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    vi.mocked(signer.getAddress).mockClear();
    await options.queryFn(mockQueryContext(options.queryKey));

    expect(signer.getAddress).not.toHaveBeenCalled();
    expect(vi.mocked(provider.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [
          "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
          "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
        ],
      }),
    );
  });

  test("queryFn uses the explicit holder without resolving the signer", async ({
    sdk,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    vi.mocked(signer.getAddress).mockClear();
    await options.queryFn(mockQueryContext(options.queryKey));

    expect(signer.getAddress).not.toHaveBeenCalled();
    expect(vi.mocked(provider.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [
          "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
          "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
        ],
      }),
    );
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({ sdk }) => {
    const options = confidentialIsApprovedQueryOptions(
      sdk,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    await expect(
      options.queryFn(
        mockQueryContext(
          zamaQueryKeys.confidentialIsApproved.scope(options.queryKey[1].tokenAddress),
        ),
      ),
    ).rejects.toThrow("confidentialIsApprovedQueryOptions: holder must not be null or undefined");
  });

  test("queryFn throws when tokenAddress is missing from context.queryKey", async ({ sdk }) => {
    const options = confidentialIsApprovedQueryOptions(sdk, undefined, {
      holder: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      spender: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "confidentialIsApprovedQueryOptions: tokenAddress must not be null or undefined",
    );
  });
});
