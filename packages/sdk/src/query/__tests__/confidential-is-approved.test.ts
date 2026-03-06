import { describe, expect, test, vi } from "../../test-fixtures";
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

    const isApproved = await options.queryFn({ queryKey: options.queryKey });
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
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );

    await options.queryFn({ queryKey: key });

    expect(vi.mocked(signer.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        address: getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        functionName: "isOperator",
        args: [
          getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
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

    await options.queryFn({ queryKey: options.queryKey });

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

    await options.queryFn({ queryKey: options.queryKey });

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
});
