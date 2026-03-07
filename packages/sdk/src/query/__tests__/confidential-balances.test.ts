import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { ReadonlyToken } from "../../token/readonly-token";
import { DecryptionFailedError } from "../../token/errors";

import { confidentialBalancesQueryOptions } from "../confidential-balances";
import { zamaQueryKeys } from "../query-keys";
import type { Address } from "viem";

describe("confidentialBalancesQueryOptions", () => {
  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x3333333333333333333333333333333333333333";
  const owner = "0x2222222222222222222222222222222222222222";

  test("uses expected key shape and staleTime Infinity", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [tokenA, tokenB],
        owner,
        handles: [
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ],
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

  test("queryFn delegates to ReadonlyToken.batchDecryptBalances and returns ConfidentialBalancesData", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const raw = new Map<Address, bigint>([
      [tokenA as Address, 10n],
      [tokenB as Address, 20n],
    ]);
    const batchSpy = vi.spyOn(ReadonlyToken, "batchDecryptBalances").mockResolvedValue(raw);

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      maxConcurrency: 3,
    });

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(batchSpy).toHaveBeenCalledWith(
      [t1, t2],
      expect.objectContaining({
        owner,
        handles: [
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ],
        maxConcurrency: 3,
      }),
    );
    // onError callback is passed but we don't assert its identity
    expect(batchSpy.mock.calls[0]![1]).toHaveProperty("onError");

    expect(result.balances.get(tokenA as Address)).toBe(10n);
    expect(result.balances.get(tokenB as Address)).toBe(20n);
    expect(result.errors.size).toBe(0);
    expect(result.isPartialError).toBe(false);

    batchSpy.mockRestore();
  });

  test("queryFn uses handles from context.queryKey", async ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const raw = new Map<Address, bigint>([[tokenA as Address, 10n]]);
    const batchSpy = vi.spyOn(ReadonlyToken, "batchDecryptBalances").mockResolvedValue(raw);

    const options = confidentialBalancesQueryOptions([t1], {
      owner,
      handles: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    });
    const key = zamaQueryKeys.confidentialBalances.tokens([tokenA], owner, [
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);

    await options.queryFn(mockQueryContext(key));

    expect(batchSpy).toHaveBeenCalledWith(
      [t1],
      expect.objectContaining({
        owner,
        handles: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        maxConcurrency: undefined,
      }),
    );
    batchSpy.mockRestore();
  });

  test("queryFn returns partial error when some tokens fail", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const decryptError = new DecryptionFailedError("decrypt failed for tokenB");

    // Mock batchDecryptBalances to invoke the onError callback for tokenB
    const batchSpy = vi
      .spyOn(ReadonlyToken, "batchDecryptBalances")
      .mockImplementation(async (_tokens, opts) => {
        // Simulate: tokenA succeeds, tokenB fails via onError
        opts?.onError?.(decryptError, tokenB as Address);
        return new Map<Address, bigint>([
          [tokenA as Address, 10n],
          [tokenB as Address, 0n], // fallback from onError
        ]);
      });

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
    });

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(result.balances.get(tokenA as Address)).toBe(10n);
    expect(result.balances.has(tokenB as Address)).toBe(false);
    expect(result.errors.get(tokenB as Address)).toBe(decryptError);
    expect(result.isPartialError).toBe(true);

    batchSpy.mockRestore();
  });

  test("queryFn throws when ALL tokens fail (total failure)", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const errorA = new DecryptionFailedError("fail A");
    const errorB = new DecryptionFailedError("fail B");

    const batchSpy = vi
      .spyOn(ReadonlyToken, "batchDecryptBalances")
      .mockImplementation(async (_tokens, opts) => {
        opts?.onError?.(errorA, tokenA as Address);
        opts?.onError?.(errorB, tokenB as Address);
        return new Map<Address, bigint>([
          [tokenA as Address, 0n],
          [tokenB as Address, 0n],
        ]);
      });

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
    });

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      DecryptionFailedError,
    );

    batchSpy.mockRestore();
  });
});
