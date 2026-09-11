import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../../relayer/types";
import { vaultBatcherAbi } from "../abi/vault-batcher.abi";

/** Returns the contract config to join the currently open batch with an encrypted amount. */
export function joinContract(
  batcher: Address,
  beneficiary: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "join",
    args: [beneficiary, encryptedAmount, inputProof],
  } as const;
}

/** Returns the contract config to claim a finalized batch's output on behalf of `account`. Permissionless. */
export function claimContract(batcher: Address, batchId: bigint, account: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "claim",
    args: [batchId, account],
  } as const;
}

/** Returns the contract config to undo the caller's own join before the batch is dispatched. */
export function quitContract(batcher: Address, batchId: bigint) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "quit", args: [batchId] } as const;
}

/** Returns the contract config to recover funds from a batch that was canceled. */
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

/**
 * Returns the contract config to read a batch's lifecycle state as a raw
 * number. The batcher contract's `BatchState` enum is the source of truth
 * for what each value means — this SDK does not yet mirror it.
 */
export function batchStateContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "batchState",
    args: [batchId],
  } as const;
}

/** Returns the contract config to read a batch's encrypted aggregate deposit amount. */
export function totalDepositsContract(batcher: Address, batchId: bigint) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "totalDeposits",
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

/** Returns the contract config to read the minimum age a batch must reach before it can be dispatched. */
export function minBatchAgeContract(batcher: Address) {
  return { address: batcher, abi: vaultBatcherAbi, functionName: "minBatchAge", args: [] } as const;
}

/** Returns the contract config to read the deadline (a duration, not a timestamp) by which a dispatched batch's callback must land. */
export function callbackDeadlineContract(batcher: Address) {
  return {
    address: batcher,
    abi: vaultBatcherAbi,
    functionName: "callbackDeadline",
    args: [],
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
