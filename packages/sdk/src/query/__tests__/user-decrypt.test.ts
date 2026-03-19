import { describe, expect, test, vi } from "../../test-fixtures";
import { userDecryptMutationOptions } from "../user-decrypt";

describe("userDecryptMutationOptions", () => {
  test("returns correct mutation key", ({ sdk }) => {
    const options = userDecryptMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.userDecrypt"]);
  });

  test("decrypts handles grouped by contract", async ({ sdk, relayer }) => {
    const handle1 = ("0x" + "01".repeat(32)) as `0x${string}`;
    const handle2 = ("0x" + "02".repeat(32)) as `0x${string}`;
    const contract1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const contract2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [handle1]: 100n })
      .mockResolvedValueOnce({ [handle2]: 200n });

    const options = userDecryptMutationOptions(sdk);
    const result = await options.mutationFn({
      handles: [
        { handle: handle1, contractAddress: contract1 },
        { handle: handle2, contractAddress: contract2 },
      ],
    });

    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ [handle1]: 100n, [handle2]: 200n });
  });

  test("groups handles by contract address", async ({ sdk, relayer }) => {
    const handle1 = ("0x" + "01".repeat(32)) as `0x${string}`;
    const handle2 = ("0x" + "02".repeat(32)) as `0x${string}`;
    const contract = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
      [handle1]: 100n,
      [handle2]: 200n,
    });

    const options = userDecryptMutationOptions(sdk);
    await options.mutationFn({
      handles: [
        { handle: handle1, contractAddress: contract },
        { handle: handle2, contractAddress: contract },
      ],
    });

    // Both handles should be in a single call since same contract
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: [handle1, handle2],
        contractAddress: contract,
      }),
    );
  });
});
