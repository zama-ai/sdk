import type { Hex } from "viem";
import type { PreparedTransaction } from "../types/prepared-tx";
import type { TransactionResult } from "../types";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link broadcastMutationOptions}. */
export interface BroadcastParams {
  readonly prepared: PreparedTransaction;
  readonly signedTx: Hex;
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.broadcast` — submits a previously-signed
 * transaction and awaits its receipt. Tx-kind only (compile-time enforced
 * upstream).
 */
export function broadcastMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.broadcast"], BroadcastParams, TransactionResult> {
  return {
    mutationKey: ["zama.broadcast"] as const,
    mutationFn: ({ prepared, signedTx, options }) => sdk.broadcast(prepared, signedTx, options),
  };
}

/** Variables for {@link completeFromTxHashMutationOptions}. */
export interface CompleteFromTxHashParams {
  readonly prepared: PreparedTransaction;
  readonly txHash: Hex;
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.completeFromTxHash` — cache-sync escape hatch
 * when an external process broadcast `prepared.unsignedTx` directly.
 */
export function completeFromTxHashMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.completeFromTxHash"],
  CompleteFromTxHashParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.completeFromTxHash"] as const,
    mutationFn: ({ prepared, txHash, options }) =>
      sdk.completeFromTxHash(prepared, txHash, options),
  };
}
