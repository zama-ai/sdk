import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress } from "viem";
import { confidentialIsApprovedQueryOptions } from "../confidential-is-approved";
import { zamaQueryKeys } from "../query-keys";

describe("confidentialIsApprovedQueryOptions", () => {
  test("stays enabled with a resolved holder", ({ signer }) => {
    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    expect(options.enabled).toBe(true);
  });

  test("is disabled when holder or spender is missing", ({ signer }) => {
    const missingHolder = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        spender: "0x3333333333333333333333333333333333333333",
      },
    );
    const missingSpender = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
      },
    );

    expect(missingHolder.enabled).toBe(false);
    expect(missingSpender.enabled).toBe(false);
  });

  test("checks operator approval", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    const isApproved = await options.queryFn(mockQueryContext(options.queryKey));
    expect(isApproved).toBe(true);
  });

  test("includes holder and spender in queryKey", ({ signer }) => {
    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.confidentialIsApproved",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    ]);
  });

  test("queryFn reads tokenAddress, holder, and spender from context.queryKey", async ({
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    const key = zamaQueryKeys.confidentialIsApproved.scope(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );

    await options.queryFn(mockQueryContext(key));

    expect(vi.mocked(signer.readContract)).toHaveBeenCalledWith(
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

  test("queryFn uses the resolved holder without querying the signer", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    await options.queryFn(mockQueryContext(options.queryKey));

    expect(signer.getAddress).not.toHaveBeenCalled();
    expect(vi.mocked(signer.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [
          getAddress("0x2222222222222222222222222222222222222222"),
          getAddress("0x3333333333333333333333333333333333333333"),
        ],
      }),
    );
  });

  test("queryFn uses the explicit holder without resolving the signer", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    await options.queryFn(mockQueryContext(options.queryKey));

    expect(signer.getAddress).not.toHaveBeenCalled();
    expect(vi.mocked(signer.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [
          getAddress("0x2222222222222222222222222222222222222222"),
          getAddress("0x3333333333333333333333333333333333333333"),
        ],
      }),
    );
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({
    signer,
  }) => {
    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        holder: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    await expect(
      options.queryFn(
        mockQueryContext(
          zamaQueryKeys.confidentialIsApproved.scope(options.queryKey[1].tokenAddress),
        ),
      ),
    ).rejects.toThrow("holder is required");
  });
});
