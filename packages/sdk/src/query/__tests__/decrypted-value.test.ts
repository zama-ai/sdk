import { describe, expect, test } from "../../test-fixtures";
import { decryptedValueQueryOptions } from "../decrypted-value";
import { decryptedValuesQueryOptions } from "../decrypted-values";
import type { Address } from "viem";

const SIGNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
const HANDLE = ("0x" + "ab".repeat(32)) as `0x${string}`;
const HANDLE_B = ("0x" + "cd".repeat(32)) as `0x${string}`;

describe("decryptedValueQueryOptions", () => {
  test("returns null on cache miss", async ({ sdk }) => {
    const opts = decryptedValueQueryOptions(sdk, {
      handle: { handle: HANDLE, contractAddress: CONTRACT },
      signerAddress: SIGNER,
    });
    const result = await opts.queryFn({
      queryKey: opts.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);
    expect(result).toBeNull();
  });

  test("returns cached value after sdk.decrypt populates cache", async ({ sdk, relayer }) => {
    const { vi } = await import("vitest");
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [HANDLE]: 42n });

    await sdk.decrypt([{ handle: HANDLE, contractAddress: CONTRACT }]);

    const opts = decryptedValueQueryOptions(sdk, {
      handle: { handle: HANDLE, contractAddress: CONTRACT },
      signerAddress: SIGNER,
    });
    const result = await opts.queryFn({
      queryKey: opts.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);
    expect(result).toBe(42n);
  });

  test("has staleTime Infinity", ({ sdk }) => {
    const opts = decryptedValueQueryOptions(sdk, {
      handle: { handle: HANDLE, contractAddress: CONTRACT },
      signerAddress: SIGNER,
    });
    expect(opts.staleTime).toBe(Infinity);
  });

  test("respects enabled: false", ({ sdk }) => {
    const opts = decryptedValueQueryOptions(sdk, {
      handle: { handle: HANDLE, contractAddress: CONTRACT },
      signerAddress: SIGNER,
      query: { enabled: false },
    });
    expect(opts.enabled).toBe(false);
  });
});

describe("decryptedValuesQueryOptions", () => {
  test("returns null for all handles on cache miss", async ({ sdk }) => {
    const opts = decryptedValuesQueryOptions(sdk, {
      handles: [
        { handle: HANDLE, contractAddress: CONTRACT },
        { handle: HANDLE_B, contractAddress: CONTRACT },
      ],
      signerAddress: SIGNER,
    });
    const result = await opts.queryFn({
      queryKey: opts.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);
    expect(result).toEqual({ [HANDLE]: null, [HANDLE_B]: null });
  });

  test("returns cached values after sdk.decrypt", async ({ sdk, relayer }) => {
    const { vi } = await import("vitest");
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
      [HANDLE]: 10n,
      [HANDLE_B]: 20n,
    });

    await sdk.decrypt([
      { handle: HANDLE, contractAddress: CONTRACT },
      { handle: HANDLE_B, contractAddress: CONTRACT },
    ]);

    const opts = decryptedValuesQueryOptions(sdk, {
      handles: [
        { handle: HANDLE, contractAddress: CONTRACT },
        { handle: HANDLE_B, contractAddress: CONTRACT },
      ],
      signerAddress: SIGNER,
    });
    const result = await opts.queryFn({
      queryKey: opts.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);
    expect(result).toEqual({ [HANDLE]: 10n, [HANDLE_B]: 20n });
  });

  test("returns mix of cached and null", async ({ sdk, relayer }) => {
    const { vi } = await import("vitest");
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [HANDLE]: 99n });

    await sdk.decrypt([{ handle: HANDLE, contractAddress: CONTRACT }]);

    const opts = decryptedValuesQueryOptions(sdk, {
      handles: [
        { handle: HANDLE, contractAddress: CONTRACT },
        { handle: HANDLE_B, contractAddress: CONTRACT },
      ],
      signerAddress: SIGNER,
    });
    const result = await opts.queryFn({
      queryKey: opts.queryKey,
      signal: AbortSignal.timeout(5000),
      meta: undefined,
    } as never);
    expect(result).toEqual({ [HANDLE]: 99n, [HANDLE_B]: null });
  });

  test("has staleTime Infinity", ({ sdk }) => {
    const opts = decryptedValuesQueryOptions(sdk, {
      handles: [{ handle: HANDLE, contractAddress: CONTRACT }],
      signerAddress: SIGNER,
    });
    expect(opts.staleTime).toBe(Infinity);
  });
});
