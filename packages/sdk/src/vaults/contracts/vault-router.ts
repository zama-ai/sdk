import { encodeAbiParameters, getAbiItem, type Address, type Hex } from "viem";
import type { EncryptedValue } from "../../relayer/types";
import { vaultRouterAbi } from "../abi/vault-router.abi";

/** One vault's share of a fan-out, its amount encrypted against the router. */
export interface EncryptedAllocationLeg {
  readonly batcher: Address;
  /** The confidential token this leg spends. */
  readonly token: Address;
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

// The push path decodes its `data` into the same pair `join` takes, so reading
// the parameters off the ABI keeps the encoding from drifting from the call.
const ALLOCATION_PARAMETERS = getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs;

/** The payload that lets one confidential transfer of the shared asset fund every leg. */
export function encodeAllocationData(
  legs: readonly EncryptedAllocationLeg[],
  inputProof: Hex,
): Hex {
  return encodeAbiParameters(ALLOCATION_PARAMETERS, [legs.map((leg) => ({ ...leg })), inputProof]);
}

/** Returns the contract config to read the registry the router gates its push path on. */
export function tokenWrapperRegistryContract(router: Address) {
  return {
    address: router,
    abi: vaultRouterAbi,
    functionName: "tokenWrapperRegistry",
    args: [],
  } as const;
}
