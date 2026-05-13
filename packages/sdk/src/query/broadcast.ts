import type { Hex } from "viem";
import type { PreparedTransaction } from "../types/offline";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link broadcastMutationOptions}. */
export interface BroadcastParams {
  readonly prepared: PreparedTransaction;
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
    mutationFn: ({ prepared, signedTx }) => sdk.offline.broadcast(prepared, signedTx),
  };
}

/** Variables for {@link attachMutationOptions}. */
export interface AttachParams {
  readonly prepared: PreparedTransaction;
  readonly txHash: Hex;
}

/**
 * Mutation options for `sdk.offline.attach` — attach to a tx that was broadcast
 * externally (custody control plane or raw `eth_sendRawTransaction`) and finish
 * the SDK lifecycle (await receipt, emit event, sync caches).
 */
export function attachMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.attach"], AttachParams, TransactionResult> {
  return {
    mutationKey: ["zama.attach"] as const,
    mutationFn: ({ prepared, txHash }) => sdk.offline.attach(prepared, txHash),
  };
}
