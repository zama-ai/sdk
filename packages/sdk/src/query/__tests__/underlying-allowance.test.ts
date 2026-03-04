import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { underlyingAllowanceQueryOptions } from "../underlying-allowance";
import { zamaQueryKeys } from "../query-keys";

describe("underlyingAllowanceQueryOptions", () => {
  test("enabled false when owner missing", () => {
    const signer = createMockSigner();
    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      { wrapperAddress: "0x3333333333333333333333333333333333333333" },
    );

    expect(options.enabled).toBe(false);
  });

  test("queries allowance when owner exists", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const allowance = await options.queryFn({ queryKey: options.queryKey });
    expect(allowance).toBe(99n);
  });

  test("includes owner and wrapperAddress in queryKey", () => {
    const signer = createMockSigner();
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

  test("queryFn reads tokenAddress, owner, and wrapperAddress from context.queryKey", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(99n);

    const options = underlyingAllowanceQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        wrapperAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const key = zamaQueryKeys.underlyingAllowance.scope(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );

    await options.queryFn({ queryKey: key });

    expect(vi.mocked(signer.readContract)).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        functionName: "allowance",
        args: [
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "0xcccccccccccccccccccccccccccccccccccccccc",
        ],
      }),
    );
  });
});
