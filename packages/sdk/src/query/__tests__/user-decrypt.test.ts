import { describe, expect, test, vi } from "../../test-fixtures";
import { userDecryptQueryOptions } from "../user-decrypt";

describe("userDecryptQueryOptions", () => {
  test("returns a requester-scoped query key with sorted handles", ({ sdk }) => {
    const handle1 = ("0x" + "02".repeat(32)) as `0x${string}`;
    const handle2 = ("0x" + "01".repeat(32)) as `0x${string}`;
    const contract = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const requester = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;

    const options = userDecryptQueryOptions(sdk, {
      handles: [
        { handle: handle1, contractAddress: contract },
        { handle: handle2, contractAddress: contract },
      ],
      requesterAddress: requester,
    });

    expect(options.queryKey[0]).toBe("zama.decryption");
    expect(options.queryKey[1].account).toBe(requester);
    const keyHandles = options.queryKey[1].handles;
    const serialized = keyHandles.map((h) => `${h.handle}:${h.contractAddress}`);
    expect(serialized).toEqual([...serialized].toSorted((a, b) => a.localeCompare(b)));
  });

  test("enabled is false when handles array is empty", ({ sdk }) => {
    const options = userDecryptQueryOptions(sdk, {
      handles: [],
      requesterAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    });
    expect(options.enabled).toBe(false);
  });

  test("enabled is false by default until explicitly opted in", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;
    const contract = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const options = userDecryptQueryOptions(sdk, {
      handles: [{ handle, contractAddress: contract }],
      requesterAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    });
    expect(options.enabled).toBe(false);
  });

  test("enabled respects query.enabled override", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;
    const contract = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const options = userDecryptQueryOptions(sdk, {
      handles: [{ handle, contractAddress: contract }],
      requesterAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      query: { enabled: true },
    });
    expect(options.enabled).toBe(true);
  });

  test("staleTime is Infinity and retry is disabled", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;
    const contract = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const options = userDecryptQueryOptions(sdk, {
      handles: [{ handle, contractAddress: contract }],
      requesterAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    });
    expect(options.staleTime).toBe(Infinity);
    expect(options.retry).toBe(false);
  });

  test("queryFn delegates to sdk.userDecrypt", async ({ sdk, relayer }) => {
    const handle1 = ("0x" + "01".repeat(32)) as `0x${string}`;
    const handle2 = ("0x" + "02".repeat(32)) as `0x${string}`;
    const contract1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const contract2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [handle1]: 100n })
      .mockResolvedValueOnce({ [handle2]: 200n });

    const handles = [
      { handle: handle1, contractAddress: contract1 },
      { handle: handle2, contractAddress: contract2 },
    ];
    const options = userDecryptQueryOptions(sdk, {
      handles,
      requesterAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    });
    const result = await options.queryFn({ queryKey: options.queryKey } as never);

    expect(result).toEqual({ [handle1]: 100n, [handle2]: 200n });
    expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contractAddress: contract1,
        signerAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      }),
    );
    expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contractAddress: contract2,
        signerAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      }),
    );
  });
});
