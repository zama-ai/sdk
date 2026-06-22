import type { Hex } from "viem";
import type { PreparedTransaction } from "../types/offline";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link broadcastMutationOptions}. */
export interface BroadcastParams {
  readonly preparedTx: PreparedTransaction;
  readonly signedTx: Hex;
}

/**
 * Mutation options for `sdk.offlineSigning.broadcast` — submits a previously-signed
 * transaction and awaits its receipt. Tx-kind only (compile-time enforced
 * upstream).
 */
export function broadcastMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.broadcast"], BroadcastParams, TransactionResult> {
  return {
    mutationKey: ["zama.broadcast"] as const,
    mutationFn: ({ preparedTx, signedTx }) => sdk.offlineSigning.broadcast(preparedTx, signedTx),
  };
}

/** Variables for {@link resumeMutationOptions}. */
export interface ResumeParams {
  readonly preparedTx: PreparedTransaction;
  readonly txHash: Hex;
}

/**
 * Mutation options for `sdk.offlineSigning.resume` — resume the SDK lifecycle for a tx
 * that was broadcast externally (custody control plane or raw
 * `eth_sendRawTransaction`): await receipt, emit event, sync caches.
 */
export function resumeMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.resume"], ResumeParams, TransactionResult> {
  return {
    mutationKey: ["zama.resume"] as const,
    mutationFn: ({ preparedTx, txHash }) => sdk.offlineSigning.resume(preparedTx, txHash),
  };
}
