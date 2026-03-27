import type { Address } from "viem";
import { deploymentCoordinatorAbi } from "../abi/deployment-coordinator.abi";

/**
 * Returns the contract config to look up a wrapper for a given ERC-20 token.
 *
 * @example
 * ```ts
 * const wrapper = await signer.readContract(
 *   getWrapperContract(registryAddress, tokenAddress),
 * );
 * ```
 */
export function getWrapperContract(registryAddress: Address, tokenAddress: Address) {
  return {
    address: registryAddress,
    abi: deploymentCoordinatorAbi,
    functionName: "getWrapper",
    args: [tokenAddress],
  } as const;
}

/**
 * Returns the contract config to check whether a wrapper exists for a token.
 *
 * @example
 * ```ts
 * const exists = await signer.readContract(
 *   wrapperExistsContract(registryAddress, tokenAddress),
 * );
 * ```
 */
export function wrapperExistsContract(registryAddress: Address, tokenAddress: Address) {
  return {
    address: registryAddress,
    abi: deploymentCoordinatorAbi,
    functionName: "wrapperExists",
    args: [tokenAddress],
  } as const;
}
