import type { Address, Hex } from "viem";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import type { EncryptedAllocationLeg } from "../allocation";

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

/** Returns the contract config to read the registry the router gates its push path on. */
export function tokenWrapperRegistryContract(router: Address) {
  return {
    address: router,
    abi: vaultRouterAbi,
    functionName: "tokenWrapperRegistry",
    args: [],
  } as const;
}
