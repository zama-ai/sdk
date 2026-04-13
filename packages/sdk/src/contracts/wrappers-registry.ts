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
  {
    inputs: [{ internalType: "address", name: "initialOwner", type: "address" }],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenAddress", type: "address" },
      { internalType: "address", name: "confidentialTokenAddress", type: "address" },
    ],
    name: "registerConfidentialToken",
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "revokeConfidentialToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface TokenWrapperPair {
  readonly tokenAddress: Address;
  readonly confidentialTokenAddress: Address;
  readonly isValid: boolean;
}

/** Extended pair with on-chain metadata for both tokens. */
export interface TokenWrapperPairWithMetadata extends TokenWrapperPair {
  readonly underlying: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
    readonly totalSupply: bigint;
  };
  readonly confidential: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
}

/** Paginated result set modelled after standard API pagination. */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Returns the contract config to fetch all token wrapper pairs.
 *
 * @example
 * ```ts
 * const pairs = await client.readContract(
 *   getTokenPairsContract(registryAddress),
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
 *   getTokenPairsLengthContract(registryAddress),
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
 *   getTokenPairsSliceContract(registryAddress, 0n, 10n),
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
 *   getTokenPairContract(registryAddress, 0n),
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
 * const [isValid, confidentialToken] = await client.readContract(
 *   getConfidentialTokenAddressContract(registryAddress, tokenAddress),
 * );
 * // isValid=false + confidentialToken=zeroAddress → not registered
 * // isValid=false + confidentialToken=nonZeroAddress → registered but revoked
 * // isValid=true  + confidentialToken=nonZeroAddress → registered and valid
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
 * const [isValid, token] = await client.readContract(
 *   getTokenAddressContract(registryAddress, confidentialTokenAddress),
 * );
 * // isValid=false + token=zeroAddress → not registered
 * // isValid=false + token=nonZeroAddress → registered but revoked
 * // isValid=true  + token=nonZeroAddress → registered and valid
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
 *   isConfidentialTokenValidContract(registryAddress, confidentialTokenAddress),
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
