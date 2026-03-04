import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { confidentialIsApprovedQueryOptions } from "../confidential-is-approved";
import { zamaQueryKeys } from "../query-keys";

describe("confidentialIsApprovedQueryOptions", () => {
  test("enabled false when owner missing", () => {
    const signer = createMockSigner();
    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      { spender: "0x3333333333333333333333333333333333333333" },
    );

    expect(options.enabled).toBe(false);
  });

  test("checks operator approval", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    const isApproved = await options.queryFn({ queryKey: options.queryKey });
    expect(isApproved).toBe(true);
  });

  test("includes owner and spender in queryKey", () => {
    const signer = createMockSigner();
    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.confidentialIsApproved",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        spender: "0x3333333333333333333333333333333333333333",
      },
    ]);
  });

  test("queryFn reads tokenAddress, owner, and spender from context.queryKey", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const options = confidentialIsApprovedQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
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
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        functionName: "isOperator",
        args: [
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "0xcccccccccccccccccccccccccccccccccccccccc",
        ],
      }),
    );
  });
});
