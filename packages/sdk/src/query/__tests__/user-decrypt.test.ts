import { describe, expect, test, vi } from "../../test-fixtures";
import { decryptValuesQueryOptions } from "../user-decrypt";
import type { Address } from "viem";

const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;

describe("decryptValuesQueryOptions", () => {
  test("decrypts handles via sdk.decryption", async ({ sdk, relayer, signer }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

    const options = decryptValuesQueryOptions(
      sdk,
      [{ encryptedValue: handle, contractAddress: CONTRACT }],
      { walletAccount: signer.walletAccount.getSnapshot() },
    );
    const result = await options.queryFn({
      queryKey: options.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);

    expect(result).toEqual({ [handle]: 100n });
  });

  test("has staleTime Infinity", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    const options = decryptValuesQueryOptions(sdk, [
      { encryptedValue: handle, contractAddress: CONTRACT },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("disabled when inputs is empty", ({ sdk }) => {
    const options = decryptValuesQueryOptions(sdk, []);
    expect(options.enabled).toBe(false);
  });

  test("enabled when inputs are provided", ({ sdk, signer }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    const options = decryptValuesQueryOptions(
      sdk,
      [{ encryptedValue: handle, contractAddress: CONTRACT }],
      { walletAccount: signer.walletAccount.getSnapshot() },
    );
    expect(options.enabled).toBe(true);
  });

  test("disabled when wallet account is absent", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    const options = decryptValuesQueryOptions(sdk, [
      { encryptedValue: handle, contractAddress: CONTRACT },
    ]);

    expect(options.enabled).toBe(false);
  });
});
