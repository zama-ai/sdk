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
  /** The group whose members to resolve. */
  group: VaultGroupConfig;
  /** Which side of the group to read — the deposit or the redeem batchers. */
  direction: BatcherDirection;
}

/** TanStack Query options accepted by {@link useActiveBatchers} (excluding `queryKey`/`queryFn`). */
export interface UseActiveBatchersOptions extends Omit<
  UseQueryOptions<Readonly<Record<string, Address>>>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
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
  options?: UseActiveBatchersOptions,
) {
  const { enabled = true } = options ?? {};
  const group = useVaultGroup(config.group);
  const baseOptions = activeBatchersQueryOptions(group, { direction: config.direction });

  return useQuery<Readonly<Record<string, Address>>>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
