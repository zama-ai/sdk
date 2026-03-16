import { type Address } from "viem";

const deploymentCoordinatorAbi = [
  {
    inputs: [{ internalType: "address", name: "originalToken", type: "address" }],
    name: "getWrapper",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "originalToken", type: "address" }],
    name: "wrapperExists",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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
export function getWrapperContract(coordinator: Address, tokenAddress: Address) {
  return {
    address: coordinator,
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
 *   wrapperExistsContract(coordinatorAddress, tokenAddress),
 * );
 * ```
 */
export function wrapperExistsContract(coordinator: Address, tokenAddress: Address) {
  return {
    address: coordinator,
    abi: deploymentCoordinatorAbi,
    functionName: "wrapperExists",
    args: [tokenAddress],
  } as const;
}
