import type { Hex } from "viem";
import type { PreparedTransaction } from "../types/offline-signing";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link broadcastMutationOptions}. */
export interface BroadcastParams {
  /** The prepared unsigned transaction that was signed. */
  readonly preparedTx: PreparedTransaction;
  /** The signed transaction bytes to broadcast. */
  readonly signedTx: Hex;
}

/**
 * Mutation options for `sdk.offline.broadcast` — submits a previously-signed
 * transaction and awaits its receipt. Tx-kind only (compile-time enforced
 * upstream).
 */
export function broadcastMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.broadcast"], BroadcastParams, TransactionResult> {
  return {
    mutationKey: ["zama.broadcast"] as const,
    mutationFn: ({ preparedTx, signedTx }) => sdk.offline.broadcast(preparedTx, signedTx),
  };
}
