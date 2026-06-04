import { invalidateWagmiBalanceQueries } from "@zama-fhe/sdk/query";
import { QueryClient } from "@tanstack/react-query";
import { readContractQueryKey, readContractsQueryKey } from "wagmi/query";
import { describe, expect, test } from "../test-fixtures";

const ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";
const OTHER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

describe("invalidateWagmiBalanceQueries against real wagmi query keys", () => {
  test.each(["balanceOf", "confidentialBalanceOf"] as const)(
    "invalidates singular readContract %s reads",
    (functionName) => {
      const qc = createQueryClient();
      const key = readContractQueryKey({ address: ADDRESS, functionName, chainId: 1 });

      qc.setQueryData(key, "balance");
      invalidateWagmiBalanceQueries(qc);

      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    },
  );

  test.each(["balanceOf", "confidentialBalanceOf"] as const)(
    "invalidates batched readContracts containing a %s read",
    (functionName) => {
      const qc = createQueryClient();
      const key = readContractsQueryKey({
        contracts: [
          { address: ADDRESS, functionName: "totalSupply" },
          { address: OTHER, functionName },
        ],
      });

      qc.setQueryData(key, "balances");
      invalidateWagmiBalanceQueries(qc);

      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    },
  );

  test("does not invalidate non-balance reads", () => {
    const qc = createQueryClient();
    const singular = readContractQueryKey({ address: ADDRESS, functionName: "totalSupply" });
    const batched = readContractsQueryKey({
      contracts: [{ address: ADDRESS, functionName: "decimals" }],
    });

    qc.setQueryData(singular, "x");
    qc.setQueryData(batched, "y");
    invalidateWagmiBalanceQueries(qc);

    expect(qc.getQueryState(singular)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(batched)?.isInvalidated).toBe(false);
  });
});
