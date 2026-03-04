import { describe, expect, test } from "vitest";

import { filterQueryOptions, hashFn, normalizeHandle, ZERO_HANDLE } from "../utils";

describe("filterQueryOptions", () => {
  test("strips TanStack behavioral options and sdk query internals", () => {
    const filtered = filterQueryOptions({
      address: "0xabc",
      owner: "0xdef",
      chainId: 1,
      staleTime: 10_000,
      gcTime: 60_000,
      enabled: true,
      refetchInterval: 1_000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
      retryDelay: 100,
      retryOnMount: true,
      queryFn: () => "noop",
      queryKey: ["k"],
      queryKeyHashFn: () => "h",
      initialData: "x",
      initialDataUpdatedAt: Date.now(),
      placeholderData: "y",
      structuralSharing: true,
      throwOnError: true,
      meta: { source: "test" },
      select: (v: unknown) => v,
      query: { enabled: false },
      pollingInterval: 12_000,
    });

    expect(filtered).toEqual({
      address: "0xabc",
      owner: "0xdef",
      chainId: 1,
    });
  });

  test("returns empty object when only stripped options are present", () => {
    const filtered = filterQueryOptions({
      staleTime: 10,
      gcTime: 20,
      enabled: false,
      query: { enabled: true },
      pollingInterval: 1000,
    });

    expect(filtered).toEqual({});
  });

  test("handles empty input", () => {
    expect(filterQueryOptions({})).toEqual({});
  });
});

describe("hashFn", () => {
  test("serializes bigint values without throwing", () => {
    expect(() => hashFn(["balance", { value: 100n }])).not.toThrow();
    expect(hashFn(["balance", { value: 100n }])).toBe(
      JSON.stringify(["balance", { value: "100" }]),
    );
  });

  test("is deterministic across object key insertion order", () => {
    const keyA = [
      "zama.fees",
      { type: "shield", feeManagerAddress: "0xabc", amount: "100", from: "0x1", to: "0x2" },
    ] as const;

    const keyB = [
      "zama.fees",
      { to: "0x2", from: "0x1", amount: "100", feeManagerAddress: "0xabc", type: "shield" },
    ] as const;

    expect(hashFn(keyA)).toBe(hashFn(keyB));
  });

  test("sorts nested plain object keys and preserves arrays", () => {
    const hash = hashFn(["nested", { outer: { z: 1, a: 2 }, values: ["0xa", "0xb"] }]);

    expect(hash).toContain('"a":2');
    expect(hash).toContain('"z":1');
    expect(hash).toContain('["0xa","0xb"]');
    expect(hash.indexOf('"a"')).toBeLessThan(hash.indexOf('"z"'));
  });

  test("handles null and undefined", () => {
    expect(() => hashFn(["test", null])).not.toThrow();
    expect(() => hashFn(["test", undefined])).not.toThrow();
  });
});

describe("normalizeHandle", () => {
  test("converts bigint to a 0x-prefixed 64-char hex string", () => {
    expect(normalizeHandle(42n)).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000002a",
    );
  });

  test("passes through valid 0x-prefixed hex strings unchanged", () => {
    const handle = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    expect(normalizeHandle(handle)).toBe(handle);
  });

  test("returns ZERO_HANDLE for non-bigint non-hex inputs", () => {
    expect(normalizeHandle(null)).toBe(ZERO_HANDLE);
    expect(normalizeHandle(undefined)).toBe(ZERO_HANDLE);
    expect(normalizeHandle(42)).toBe(ZERO_HANDLE);
    expect(normalizeHandle("not-hex")).toBe(ZERO_HANDLE);
  });
});
