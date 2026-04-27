import type { Address } from "viem";
import { DecryptionFailedError } from "../../errors";
import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { ReadonlyToken } from "../../token/readonly-token";
import { ZamaSDK } from "../../zama-sdk";
import { confidentialBalancesQueryOptions } from "../confidential-balances";

describe("confidentialBalancesQueryOptions", () => {
  const tokenA = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
  const tokenB = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

  test("query key includes tokenAddresses and owner (no handles)", ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const options = confidentialBalancesQueryOptions([t1, t2], { account: owner });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalances",
      { tokenAddresses: [tokenA, tokenB], owner },
    ]);
  });

  test("enabled is true when tokens and owner are provided", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], { account: owner });

    expect(options.enabled).toBe(true);
  });

  test("enabled is false when owner is undefined", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1]);

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when the token list is empty", () => {
    const options = confidentialBalancesQueryOptions([], { account: owner });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ createMockReadonlyToken }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {
      account: owner,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when signer-backed credentials are absent", ({
    relayer,
    provider,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    const token = new ReadonlyToken(sdk, tokenA);

    const options = confidentialBalancesQueryOptions([token], { account: owner });

    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to ReadonlyToken.batchBalancesOf using owner from queryKey", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const mockResult = {
      results: new Map<Address, bigint>([
        [tokenA, 10n],
        [tokenB, 20n],
      ]),
      errors: new Map(),
    };
    const spy = vi.spyOn(ReadonlyToken, "batchBalancesOf").mockResolvedValue(mockResult);

    const options = confidentialBalancesQueryOptions([t1, t2], { account: owner });

    const query = await options.queryFn(mockQueryContext(options.queryKey));

    expect(spy).toHaveBeenCalledWith([t1, t2], owner);
    expect(query).toBe(mockResult);
    expect(query.results.get(tokenA)).toBe(10n);
    expect(query.results.get(tokenB)).toBe(20n);
    expect(query.errors.size).toBe(0);
  });

  test("queryFn propagates errors thrown by batchBalancesOf (total failure)", async ({
    createMockReadonlyToken,
  }) => {
    const t1 = createMockReadonlyToken(tokenA);
    vi.spyOn(ReadonlyToken, "batchBalancesOf").mockRejectedValue(
      new DecryptionFailedError("all failed"),
    );

    const options = confidentialBalancesQueryOptions([t1], { account: owner });

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      DecryptionFailedError,
    );
  });
});
