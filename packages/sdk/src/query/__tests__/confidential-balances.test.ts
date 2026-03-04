import { describe, expect, test, vi } from "vitest";
import { ReadonlyToken } from "../../token/readonly-token";
import type { Address } from "../../token/token.types";
import { confidentialBalancesQueryOptions } from "../confidential-balances";
import { zamaQueryKeys } from "../query-keys";
import { createMockReadonlyToken } from "./test-helpers";

describe("confidentialBalancesQueryOptions", () => {
  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x3333333333333333333333333333333333333333";
  const owner = "0x2222222222222222222222222222222222222222";

  test("uses expected key shape and staleTime Infinity", () => {
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

  test("enabled is false when owner is missing", () => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {});

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when token list is empty", () => {
    const options = confidentialBalancesQueryOptions([], { owner });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", () => {
    const t1 = createMockReadonlyToken(tokenA);
    const options = confidentialBalancesQueryOptions([t1], {
      owner,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to ReadonlyToken.batchDecryptBalances", async () => {
    const t1 = createMockReadonlyToken(tokenA);
    const t2 = createMockReadonlyToken(tokenB);
    const expected = new Map<Address, bigint>([[tokenA as Address, 10n]]);
    const batchSpy = vi.spyOn(ReadonlyToken, "batchDecryptBalances").mockResolvedValue(expected);

    const options = confidentialBalancesQueryOptions([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      maxConcurrency: 3,
    });

    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(batchSpy).toHaveBeenCalledWith([t1, t2], {
      owner,
      handles: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      maxConcurrency: 3,
    });
    expect(result).toBe(expected);

    batchSpy.mockRestore();
  });

  test("queryFn uses handles from context.queryKey", async () => {
    const t1 = createMockReadonlyToken(tokenA);
    const expected = new Map<Address, bigint>([[tokenA as Address, 10n]]);
    const batchSpy = vi.spyOn(ReadonlyToken, "batchDecryptBalances").mockResolvedValue(expected);

    const options = confidentialBalancesQueryOptions([t1], {
      owner,
      handles: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    });
    const key = zamaQueryKeys.confidentialBalances.tokens([tokenA], owner, [
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);

    await options.queryFn({ queryKey: key });

    expect(batchSpy).toHaveBeenCalledWith([t1], {
      owner,
      handles: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      maxConcurrency: undefined,
    });
    batchSpy.mockRestore();
  });
});
