import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { confidentialHandleQueryOptions } from "../confidential-handle";

describe("confidentialHandleQueryOptions", () => {
  test("defaults refetchInterval to 10000 and can be overridden", () => {
    const signer = createMockSigner();

    const defaults = confidentialHandleQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      { owner: "0x2222222222222222222222222222222222222222" },
    );
    const custom = confidentialHandleQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        owner: "0x2222222222222222222222222222222222222222",
        pollingInterval: 2500,
      },
    );

    expect(defaults.refetchInterval).toBe(10_000);
    expect(custom.refetchInterval).toBe(2500);
  });

  test("queryFn extracts owner + tokenAddress from context.queryKey", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    const options = confidentialHandleQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      { owner: "0x2222222222222222222222222222222222222222" },
    );

    const queryKey = [
      "zama.confidentialHandle",
      {
        tokenAddress: "0x3333333333333333333333333333333333333333",
        owner: "0x4444444444444444444444444444444444444444",
      },
    ] as const;

    await options.queryFn({ queryKey });

    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x3333333333333333333333333333333333333333",
      functionName: "confidentialBalanceOf",
      args: ["0x4444444444444444444444444444444444444444"],
    });
  });

  test("enabled is false when owner missing", () => {
    const signer = createMockSigner();
    const options = confidentialHandleQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {},
    );

    expect(options.enabled).toBe(false);
  });
});
