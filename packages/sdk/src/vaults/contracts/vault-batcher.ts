import type { Address, Hex } from "viem";
import { vaultBatcherAbi } from "../abi/vault-batcher.abi";

/** Returns the contract config to claim a finalized batch's output on behalf of `account`. Permissionless. */
export function claimContract(batcher: Address, batchId: bigint, account: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "claim",
    args: [batchId, account],
  } as const;
}

/** Returns the contract config to withdraw the caller's own deposit from a pending or canceled batch. */
export function quitContract(batcher: Address, batchId: bigint) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "quit", args: [batchId] } as const;
}

/** Returns the contract config to refund `account`'s deposit in a canceled batch. Permissionless — the refund goes to `account`, not the caller. */
export function recoverContract(batcher: Address, batchId: bigint, account: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "recover",
    args: [batchId, account],
  } as const;
}

/** Returns the contract config to close the current batch and kick off decryption. Permissionless. */
export function dispatchBatchContract(batcher: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "dispatchBatch",
    args: [],
  } as const;
}

/** Returns the contract config to read the id of the currently open batch. */
export function currentBatchIdContract(batcher: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "currentBatchId",
    args: [],
  } as const;
}

/** Returns the contract config to read a batch's lifecycle state (the contract's `BatchState` enum). */
export function batchStateContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchState",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read one account's encrypted deposit within a batch. */
export function depositsContract(batcher: Address, batchId: bigint, account: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "deposits",
    args: [batchId, account],
  } as const;
}

/** Returns the contract config to read the underlying ERC-4626 vault address. */
export function vaultContract(batcher: Address) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "vault", args: [] } as const;
}

/** Returns the contract config to read the confidential token this batcher accepts as input. */
export function fromTokenContract(batcher: Address) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "fromToken", args: [] } as const;
}

/** Returns the contract config to read the confidential token this batcher pays out. */
export function toTokenContract(batcher: Address) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "toToken", args: [] } as const;
}

/** Returns the contract config to read the minimum age pinned to one batch when it opened. */
export function batchMinBatchAgeContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchMinBatchAge",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read the callback deadline pinned to one batch when it opened. */
export function batchCallbackDeadlineContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchCallbackDeadline",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read the Unix timestamp a batch was opened at. */
export function batchCreatedAtContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchCreatedAt",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read the Unix timestamp a batch was dispatched at, or 0 if not yet dispatched. */
export function batchDispatchedAtContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchDispatchedAt",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read a finalized batch's exchange rate, or 0 while unfinalized. */
export function exchangeRateContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "exchangeRate",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read the number of decimals the exchange rate is scaled by. */
export function exchangeRateDecimalsContract(batcher: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "exchangeRateDecimals",
    args: [],
  } as const;
}

/** Returns the contract config to read whether the batcher is paused (blocking joins and dispatch). */
export function pausedContract(batcher: Address) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "paused", args: [] } as const;
}

/** Returns the contract config to read the unwrap request a dispatched batch is waiting on. */
export function unwrapRequestIdContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "unwrapRequestId",
    args: [batchId],
  } as const;
}

/**
 * Returns the contract config to settle a dispatched batch with the public decryption of its
 * aggregate amount, or to cancel it once its callback deadline has passed. Permissionless.
 */
export function dispatchBatchCallbackContract(
  batcher: Address,
  batchId: bigint,
  unwrapAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "dispatchBatchCallback",
    args: [batchId, unwrapAmountCleartext, decryptionProof],
  } as const;
}
