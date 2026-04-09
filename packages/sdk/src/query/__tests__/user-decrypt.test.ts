import { describe, expect, test, vi } from "../../test-fixtures";
import { userDecryptQueryOptions } from "../user-decrypt";
import type { Address } from "viem";

const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;

describe("userDecryptQueryOptions", () => {
  test("decrypts handles via sdk.decrypt", async ({ sdk, relayer }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

    const options = userDecryptQueryOptions(sdk, {
      handles: [{ handle, contractAddress: CONTRACT }],
    });
    const result = await options.queryFn({
      queryKey: options.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);

    expect(result).toEqual({ [handle]: 100n });
  });

  test("has staleTime Infinity", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    const options = userDecryptQueryOptions(sdk, {
      handles: [{ handle, contractAddress: CONTRACT }],
    });
    expect(options.staleTime).toBe(Infinity);
  });

  test("disabled when handles is empty", ({ sdk }) => {
    const options = userDecryptQueryOptions(sdk, { handles: [] });
    expect(options.enabled).toBe(false);
  });

  test("respects enabled: false", ({ sdk }) => {
    const handle = ("0x" + "01".repeat(32)) as `0x${string}`;

    const options = userDecryptQueryOptions(
      sdk,
      { handles: [{ handle, contractAddress: CONTRACT }] },
      { enabled: false },
    );
    expect(options.enabled).toBe(false);
  });
});
