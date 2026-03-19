import type { Address } from "viem";

export const wrappersRegistryAbi = [
  {
    inputs: [],
    name: "getTokenConfidentialTokenPairs",
    outputs: [
      {
        components: [
          { internalType: "address", name: "tokenAddress", type: "address" },
          {
            internalType: "address",
            name: "confidentialTokenAddress",
            type: "address",
          },
          { internalType: "bool", name: "isValid", type: "bool" },
        ],
        internalType: "struct ConfidentialTokenWrappersRegistry.TokenWrapperPair[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTokenConfidentialTokenPairsLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "fromIndex", type: "uint256" },
      { internalType: "uint256", name: "toIndex", type: "uint256" },
    ],
    name: "getTokenConfidentialTokenPairsSlice",
    outputs: [
      {
        components: [
          { internalType: "address", name: "tokenAddress", type: "address" },
          {
            internalType: "address",
            name: "confidentialTokenAddress",
            type: "address",
          },
          { internalType: "bool", name: "isValid", type: "bool" },
        ],
        internalType: "struct ConfidentialTokenWrappersRegistry.TokenWrapperPair[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getTokenConfidentialTokenPair",
    outputs: [
      {
        components: [
          { internalType: "address", name: "tokenAddress", type: "address" },
          {
            internalType: "address",
            name: "confidentialTokenAddress",
            type: "address",
          },
          { internalType: "bool", name: "isValid", type: "bool" },
        ],
        internalType: "struct ConfidentialTokenWrappersRegistry.TokenWrapperPair",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "tokenAddress", type: "address" }],
    name: "getConfidentialTokenAddress",
    outputs: [
      { internalType: "bool", name: "", type: "bool" },
      { internalType: "address", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "confidentialTokenAddress",
        type: "address",
      },
    ],
    name: "getTokenAddress",
    outputs: [
      { internalType: "bool", name: "", type: "bool" },
      { internalType: "address", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "confidentialTokenAddress",
        type: "address",
      },
    ],
    name: "isConfidentialTokenValid",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface TokenWrapperPair {
  readonly tokenAddress: Address;
  readonly confidentialTokenAddress: Address;
  readonly isValid: boolean;
}

/**
 * Returns the contract config to fetch all token wrapper pairs.
 *
 * @example
 * ```ts
 * const pairs = await client.readContract(
 *   getTokenPairsContract(wrappersRegistryAddress),
 * );
 * ```
 */
export function getTokenPairsContract(registry: Address) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getTokenConfidentialTokenPairs",
    args: [],
  } as const;
}

/**
 * Returns the contract config to get the number of token wrapper pairs.
 *
 * @example
 * ```ts
 * const length = await client.readContract(
 *   getTokenPairsLengthContract(wrappersRegistryAddress),
 * );
 * ```
 */
export function getTokenPairsLengthContract(registry: Address) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getTokenConfidentialTokenPairsLength",
    args: [],
  } as const;
}

/**
 * Returns the contract config to fetch a slice of token wrapper pairs.
 *
 * @example
 * ```ts
 * const pairs = await client.readContract(
 *   getTokenPairsSliceContract(wrappersRegistryAddress, 0n, 10n),
 * );
 * ```
 */
export function getTokenPairsSliceContract(registry: Address, fromIndex: bigint, toIndex: bigint) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getTokenConfidentialTokenPairsSlice",
    args: [fromIndex, toIndex],
  } as const;
}

/**
 * Returns the contract config to fetch a single token wrapper pair by index.
 *
 * @example
 * ```ts
 * const pair = await client.readContract(
 *   getTokenPairContract(wrappersRegistryAddress, 0n),
 * );
 * ```
 */
export function getTokenPairContract(registry: Address, index: bigint) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getTokenConfidentialTokenPair",
    args: [index],
  } as const;
}

/**
 * Returns the contract config to look up the confidential token for a given plain token.
 *
 * @example
 * ```ts
 * const [found, confidentialToken] = await client.readContract(
 *   getConfidentialTokenAddressContract(wrappersRegistryAddress, tokenAddress),
 * );
 * ```
 */
export function getConfidentialTokenAddressContract(registry: Address, tokenAddress: Address) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getConfidentialTokenAddress",
    args: [tokenAddress],
  } as const;
}

/**
 * Returns the contract config to look up the plain token for a given confidential token.
 *
 * @example
 * ```ts
 * const [found, token] = await client.readContract(
 *   getTokenAddressContract(wrappersRegistryAddress, confidentialTokenAddress),
 * );
 * ```
 */
export function getTokenAddressContract(registry: Address, confidentialTokenAddress: Address) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "getTokenAddress",
    args: [confidentialTokenAddress],
  } as const;
}

/**
 * Returns the contract config to check if a confidential token is valid.
 *
 * @example
 * ```ts
 * const isValid = await client.readContract(
 *   isConfidentialTokenValidContract(wrappersRegistryAddress, confidentialTokenAddress),
 * );
 * ```
 */
export function isConfidentialTokenValidContract(
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return {
    address: registry,
    abi: wrappersRegistryAbi,
    functionName: "isConfidentialTokenValid",
    args: [confidentialTokenAddress],
  } as const;
}
