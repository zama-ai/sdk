"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import {
  positionQueryOptions,
  type VaultPosition,
  type VaultRecord,
  type VaultsConfig,
} from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultClient } from "./use-vault-client";

/** TanStack Query options accepted by {@link usePosition}. */
export interface UsePositionOptions<TConfig extends VaultsConfig> extends Omit<
  UseQueryOptions<VaultPosition<TConfig>>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Decrypt every leg's deposit, as the signer, to fill `amount`, `chosenVaultId` and the `closed` phase. */
  decrypt?: boolean;
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * A join's position: every leg's batch state, the phase, and the actions
 * legal now. Refetches when `nextChangeAt` passes and polls while a leg
 * settles, so a UI needs no timer of its own.
 *
 * @param config - The {@link defineVaults} config.
 * @param record - The join to read. The query stays disabled while `undefined`.
 *
 * @example
 * ```tsx
 * const { data: position } = usePosition(VAULTS, record);
 * const exit = useExit(VAULTS);
 * {position?.availableActions.includes("exit") && (
 *   <Button onClick={() => exit.mutate(record)}>Exit</Button>
 * )}
 * ```
 */
export function usePosition<const TConfig extends VaultsConfig>(
  config: TConfig,
  record: VaultRecord<TConfig> | undefined,
  options?: UsePositionOptions<TConfig>,
) {
  const { decrypt, enabled = true, ...rest } = options ?? {};
  const baseOptions = positionQueryOptions(useVaultClient(config), { record, decrypt });
  return useQuery<VaultPosition<TConfig>>({
    ...baseOptions,
    ...rest,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
