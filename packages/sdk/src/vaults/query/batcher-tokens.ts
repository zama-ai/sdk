import type { Address } from "viem";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** A batcher's input and output tokens. */
export interface BatcherTokens {
  /** The token a join spends: the asset for a deposit batcher, the share for a redeem batcher. */
  fromToken: Address;
  /** The token a claim pays out. */
  toToken: Address;
}

/** Configuration for {@link batcherTokensQueryOptions}. */
export interface BatcherTokensQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for a batcher's input and output tokens — see
 * {@link VaultBatcher.fromToken} and {@link VaultBatcher.toToken}. They are
 * fixed at deploy time, so the result never goes stale.
 */
export function batcherTokensQueryOptions(
  batcher: VaultBatcher,
  config: BatcherTokensQueryConfig = {},
): QueryFactoryOptions<
  BatcherTokens,
  Error,
  BatcherTokens,
  ReturnType<typeof vaultQueryKeys.batcherTokens.batcher>
> {
  const queryOpts = config.query ?? {};

  return {
    staleTime: Infinity,
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.batcherTokens.batcher(batcher.address, batcher.chainId),
    queryFn: async () => {
      const [fromToken, toToken] = await Promise.all([batcher.fromToken(), batcher.toToken()]);
      return { fromToken, toToken };
    },
    enabled: queryOpts.enabled !== false,
  };
}
