import { DEPLOYMENT_COORDINATOR_ABI } from "../abi/deployment-coordinator.abi";
import type { Hex } from "../relayer/relayer-sdk.types";

/**
 * Returns the contract config to look up a wrapper for a given ERC-20 token.
 *
 * @example
 * ```ts
 * const wrapper = await signer.readContract(
 *   getWrapperContract(coordinatorAddress, tokenAddress),
 * );
 * ```
 */
export function getWrapperContract(coordinator: Hex, tokenAddress: Hex) {
  return {
    address: coordinator,
    abi: DEPLOYMENT_COORDINATOR_ABI,
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
 *   wrapperExistsContract(coordinatorAddress, tokenAddress),
 * );
 * ```
 */
export function wrapperExistsContract(coordinator: Hex, tokenAddress: Hex) {
  return {
    address: coordinator,
    abi: DEPLOYMENT_COORDINATOR_ABI,
    functionName: "wrapperExists",
    args: [tokenAddress],
  } as const;
}
