import { encodeAbiParameters, getAbiItem, type Address, type Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import { vaultRouterAbi } from "./abi/vault-router.abi";

/** One vault's share of a fan-out. */
export interface AllocationLeg {
  readonly batcher: Address;
  /** The confidential token this leg spends. */
  readonly token: Address;
  /** The plaintext amount, encrypted before submission. */
  readonly amount: bigint;
}

/** An {@link AllocationLeg} whose amount has been encrypted against the router. */
export interface EncryptedAllocationLeg {
  readonly batcher: Address;
  readonly token: Address;
  readonly amount: EncryptedValue;
}

/** A leg set and the single input proof that covers all of it. */
export interface EncryptedAllocation {
  /** In the order they were submitted for encryption. */
  readonly legs: readonly EncryptedAllocationLeg[];
  readonly inputProof: Hex;
}

// The push path decodes its `data` into the same pair `join` takes, so reading
// the parameters off the ABI keeps the encoding from drifting from the call.
const ALLOCATION_PARAMETERS = getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs;

/** The payload that lets one confidential transfer of the shared asset fund every leg. */
export function encodeAllocationData(allocation: EncryptedAllocation): Hex {
  return encodeAbiParameters(ALLOCATION_PARAMETERS, [
    allocation.legs.map((leg) => ({ ...leg })),
    allocation.inputProof,
  ]);
}
