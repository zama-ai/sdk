import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, it } from "../../test-fixtures";
import { useQueries } from "../query";

describe("useQueries wrapper", () => {
  it("injects queryKeyHashFn on every query in the array", ({ renderWithProviders }) => {
    const { queryClient } = renderWithProviders(() =>
      useQueries({
        queries: [
          {
            queryKey: zamaQueryKeys.decryption.handle("0xabc"),
            queryFn: () => undefined as never,
            enabled: false,
          },
          {
            queryKey: zamaQueryKeys.decryption.handle("0xdef"),
            queryFn: () => undefined as never,
            enabled: false,
          },
        ],
      }),
    );

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(2);
    for (const query of cache) {
      expect(query.options.queryKeyHashFn).toBe(hashFn);
    }
  });

  it("works with a single query", ({ renderWithProviders }) => {
    const { queryClient } = renderWithProviders(() =>
      useQueries({
        queries: [
          {
            queryKey: zamaQueryKeys.decryption.handle("0x123"),
            queryFn: () => undefined as never,
            enabled: false,
          },
        ],
      }),
    );

    const cached = queryClient.getQueryCache().getAll();
    expect(cached).toHaveLength(1);
    expect(cached[0]!.options.queryKeyHashFn).toBe(hashFn);
  });

  it("works with empty queries array", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useQueries({ queries: [] }),
    );

    expect(result.current).toHaveLength(0);
  });
});
