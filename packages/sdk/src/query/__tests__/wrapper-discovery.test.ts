import { describe, expect, test, vi } from "../../test-fixtures";
import { wrapperDiscoveryQueryOptions } from "../wrapper-discovery";

describe("wrapperDiscoveryQueryOptions", () => {
  test("includes coordinatorAddress in query key", ({ signer }) => {
    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.wrapperDiscovery",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    ]);
  });

  test("returns null when wrapper does not exist", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(false);

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const wrapper = await options.queryFn({ queryKey: options.queryKey });
    expect(wrapper).toBeNull();
  });

  test("reads wrapper when it exists", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce("0x4444444444444444444444444444444444444444");

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const wrapper = await options.queryFn({ queryKey: options.queryKey });
    expect(wrapper).toBe("0x4444444444444444444444444444444444444444");
  });

  test("queryFn uses coordinatorAddress from context.queryKey", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(false);

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const queryKey = [
      "zama.wrapperDiscovery",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        coordinatorAddress: "0x5555555555555555555555555555555555555555",
      },
    ] as const;

    await options.queryFn({ queryKey });

    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x5555555555555555555555555555555555555555",
      args: ["0x1111111111111111111111111111111111111111"],
    });
  });
});
