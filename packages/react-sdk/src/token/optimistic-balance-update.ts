import type { QueryClient } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";

type BalanceDeltaMode = "add" | "subtract";

export async function applyOptimisticBalanceDelta(
  queryClient: QueryClient,
  tokenAddress: Address,
  amount: bigint,
  mode: BalanceDeltaMode,
) {
  const balanceKey = zamaQueryKeys.confidentialBalance.token(tokenAddress);
  await queryClient.cancelQueries({ queryKey: balanceKey });
  const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
  for (const [key, value] of previous) {
    if (value === undefined) continue;
    queryClient.setQueryData(key, mode === "add" ? value + amount : value - amount);
  }
}

export function rollbackOptimisticBalanceDelta(queryClient: QueryClient, tokenAddress: Address) {
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
}
