import { hashFn } from "@zama-fhe/sdk/query";
import { describe, expect, it } from "../../test-fixtures";
import { useQueries } from "../query";

describe("useQueries wrapper", () => {
  it("injects queryKeyHashFn into every query", ({ renderWithProviders }) => {
    const { queryClient } = renderWithProviders(() =>
      useQueries({
        queries: [
          { queryKey: ["test", "a"], queryFn: () => 1, enabled: false },
          { queryKey: ["test", "b"], queryFn: () => 2, enabled: false },
        ],
      }),
    );

    const queries = queryClient.getQueryCache().getAll();
    expect(queries.length).toBeGreaterThanOrEqual(2);

    for (const query of queries) {
      expect(query.options.queryKeyHashFn).toBe(hashFn);
    }
  });
});
