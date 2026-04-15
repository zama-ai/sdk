import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import type { vi } from "../../test-fixtures";
import { DecryptionFailedError } from "../../errors";

import { confidentialBalancesQueryOptions } from "../confidential-balances";
import { zamaQueryKeys } from "../query-keys";
import type { Address } from "viem";

describe("confidentialBalancesQueryOptions", () => {
  const tokenA = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";
  const tokenB = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C";
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";
  const handleA = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa";
  const handleB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb";

  test("uses expected key shape and staleTime Infinity", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [handleA, handleB],
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [tokenA, tokenB],
        owner,
        handles: [handleA, handleB],
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false when owner is missing", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {});

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when token list is empty", () => {
    const options = confidentialBalancesQueryOptions([], { owner });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {
      owner,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when handles are missing", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {
      owner,
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn pre-authorizes all token addresses then decrypts per-handle via sdk.userDecrypt", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    // All tokens in a batch share the same SDK in production — mirror that here so
    // the queryFn's `tokens[0].sdk` covers both.
    Object.defineProperty(t2, "sdk", { value: t1.sdk, configurable: true });

    (t1.sdk.allow as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (t1.sdk.userDecrypt as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ [handleA]: 10n })
      .mockResolvedValueOnce({ [handleB]: 20n });

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [handleA, handleB],
    });

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(t1.sdk.allow).toHaveBeenCalledWith([tokenA, tokenB]);
    expect(t1.sdk.userDecrypt).toHaveBeenNthCalledWith(1, [
      { handle: handleA, contractAddress: tokenA },
    ]);
    expect(t1.sdk.userDecrypt).toHaveBeenNthCalledWith(2, [
      { handle: handleB, contractAddress: tokenB },
    ]);

    expect(result.balances.get(tokenA as Address)).toBe(10n);
    expect(result.balances.get(tokenB as Address)).toBe(20n);
    expect(result.errors.size).toBe(0);
    expect(result.isPartialError).toBe(false);
  });

  test("queryFn uses handles from context.queryKey", async ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    (t1.sdk.userDecrypt as ReturnType<typeof vi.fn>).mockResolvedValue({ [handleB]: 99n });

    const options = confidentialBalancesQueryOptions([t1], {
      owner,
      handles: [handleA],
    });
    const key = zamaQueryKeys.confidentialBalances.tokens([tokenA], owner, [handleB]);

    await options.queryFn(mockQueryContext(key));

    expect(t1.sdk.userDecrypt).toHaveBeenCalledWith([{ handle: handleB, contractAddress: tokenA }]);
  });

  test("queryFn returns partial error when some tokens fail", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    Object.defineProperty(t2, "sdk", { value: t1.sdk, configurable: true });

    (t1.sdk.userDecrypt as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ [handleA]: 10n })
      .mockRejectedValueOnce(new DecryptionFailedError("decrypt failed for tokenB"));

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [handleA, handleB],
    });

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(result.balances.get(tokenA as Address)).toBe(10n);
    expect(result.balances.has(tokenB as Address)).toBe(false);
    expect(result.errors.get(tokenB as Address)).toBeInstanceOf(DecryptionFailedError);
    expect(result.isPartialError).toBe(true);
  });

  test("queryFn throws when ALL tokens fail (total failure)", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    Object.defineProperty(t2, "sdk", { value: t1.sdk, configurable: true });

    (t1.sdk.userDecrypt as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DecryptionFailedError("fail"),
    );

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [handleA, handleB],
    });

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      DecryptionFailedError,
    );
  });
});
