import type { PreparedFor, TransactionKind } from "../types/offline-signing";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link refreshPreparedMutationOptions}. */
export interface RefreshPreparedParams {
  /** The prepared unsigned transaction to re-stamp with current chain state. */
  readonly preparedTx: PreparedFor<TransactionKind>;
  /** Optional overrides for the offline-signing refresh step. */
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.offlineSigning.refresh` — re-stamps a prepared
 * transaction with the current chain state (nonce, fees, gas limit).
 * The original `preparedTx` is left untouched (immutable).
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
    mutationFn: ({ preparedTx, options }) => sdk.offlineSigning.refresh(preparedTx, options),
  };
}
