import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { wrapperDiscoveryQueryOptions } from "../wrapper-discovery";

describe("wrapperDiscoveryQueryOptions", () => {
  test("is disabled when tokenAddress or coordinatorAddress is missing", ({ signer }) => {
    const missingToken = wrapperDiscoveryQueryOptions(signer, undefined, {
      coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    const missingCoordinator = wrapperDiscoveryQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {},
    );

    expect(missingToken.enabled).toBe(false);
    expect(missingCoordinator.enabled).toBe(false);
  });

  test("includes coordinatorAddress in query key", ({ signer }) => {
    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    expect(options.queryKey).toEqual([
      "zama.wrapperDiscovery",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    ]);
  });

  test("returns null when wrapper does not exist", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(false);

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const wrapper = await options.queryFn(mockQueryContext(options.queryKey));
    expect(wrapper).toBeNull();
  });

  test("reads wrapper when it exists", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce("0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D");

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const wrapper = await options.queryFn(mockQueryContext(options.queryKey));
    expect(wrapper).toBe("0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D");
  });

  test("queryFn uses coordinatorAddress from context.queryKey", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(false);

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      {
        coordinatorAddress: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    );

    const queryKey = [
      "zama.wrapperDiscovery",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        coordinatorAddress: "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e",
      },
    ] as const;

    await options.queryFn(mockQueryContext(queryKey));

    expect(vi.mocked(signer.readContract).mock.calls[0]?.[0]).toMatchObject({
      address: "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e",
      args: ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a"],
    });
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({
    signer,
  }) => {
    const options = wrapperDiscoveryQueryOptions(signer, undefined, {});

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "tokenAddress is required",
    );
  });
});
