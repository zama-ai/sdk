"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  activeBatchersQueryOptions,
  type BatcherDirection,
  type VaultGroupConfig,
} from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useActiveBatchers}. */
export interface UseActiveBatchersConfig {
  group: VaultGroupConfig;
  direction: BatcherDirection;
}

/**
 * The batcher each member of a group would currently join, keyed by member id.
 *
 * @param config - The group and direction.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @remarks
 * A submission resolves this itself, so the hook is only for showing it. Pass
 * a `refetchInterval` on a screen that stays open.
 *
 * @example
 * ```tsx
 * const { data } = useActiveBatchers({ group: STABLE_GROUP, direction: "deposit" });
 * ```
 */
export function useActiveBatchers(
  config: UseActiveBatchersConfig,
  options?: Omit<UseQueryOptions<Readonly<Record<string, Address>>>, "queryKey" | "queryFn">,
) {
  const group = useVaultGroup(config.group);
  const baseOpts = activeBatchersQueryOptions(group, { direction: config.direction });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
