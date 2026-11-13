import { encodeAbiParameters, getAbiItem, type Address, type Hex } from "viem";
import type { EncryptedValue } from "../../relayer/types";
import { vaultRouterAbi } from "../abi/vault-router.abi";

/** One vault's share of a fan-out. */
export interface EncryptedAllocationLeg {
  readonly batcher: Address;
  /** The confidential token this leg spends. */
  readonly token: Address;
  /** Encrypted with the router as the verifying contract. */
  readonly amount: EncryptedValue;
}

/** Returns the contract config to pull every leg from the caller and join each named batcher. */
export function routerJoinContract(
  router: Address,
  legs: readonly EncryptedAllocationLeg[],
  inputProof: Hex,
) {
  return {
    address: router,
    abi: vaultRouterAbi,
    functionName: "join",
    args: [legs, inputProof],
  } as const;
}

// The push path decodes `data` into `join`'s parameters, so take them from the ABI.
const ALLOCATION_PARAMETERS = getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs;

/** The payload that lets one confidential transfer of the shared asset fund every leg. */
export function encodeAllocationData(
  legs: readonly EncryptedAllocationLeg[],
  inputProof: Hex,
): Hex {
  return encodeAbiParameters(ALLOCATION_PARAMETERS, [legs.map((leg) => ({ ...leg })), inputProof]);
}
