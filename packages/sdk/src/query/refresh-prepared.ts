import type { PreparedFor, TransactionKind } from "../types/offline";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link refreshPreparedMutationOptions}. */
export interface RefreshPreparedParams {
  readonly prepared: PreparedFor<TransactionKind>;
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.offline.refresh` — re-stamps a prepared
 * transaction with the current chain state (nonce, fees, gas limit).
 * The original `prepared` is left untouched (immutable).
 */
export function refreshPreparedMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.refreshPrepared"],
  RefreshPreparedParams,
  PreparedFor<TransactionKind>
> {
  return {
    mutationKey: ["zama.refreshPrepared"] as const,
    mutationFn: ({ prepared, options }) => sdk.offline.refresh(prepared, options),
  };
}
