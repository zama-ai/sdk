import type { Address, Hex } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

/** Configuration for {@link pendingUnshieldQueryOptions}. */
export interface PendingUnshieldQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for reading the unwrap tx hash of an unshield that was
 * interrupted between its two phases (returns `null` if none is pending).
 *
 * Backed by {@link ZamaSDK} storage via `WrappedToken.getPendingUnshield()`.
 * `staleTime: 0` so the value reflects storage on mount; the unshield/unwrap
 * mutations also invalidate this key on success.
 */
export function pendingUnshieldQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address,
  config?: PendingUnshieldQueryConfig,
): QueryFactoryOptions<
  Hex | null,
  Error,
  Hex | null,
  ReturnType<typeof zamaQueryKeys.pendingUnshield.token>
> {
  const queryKey = zamaQueryKeys.pendingUnshield.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return sdk.createWrappedToken(keyTokenAddress).getPendingUnshield();
    },
    staleTime: 0,
    enabled: config?.query?.enabled !== false,
  };
}
