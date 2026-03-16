import { Address, toHex } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";

const encryptedAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "confidentialBalanceOf",
    outputs: [
      {
        internalType: "euint64",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "externalEuint64",
        name: "encryptedAmount",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "inputProof",
        type: "bytes",
      },
    ],
    name: "confidentialTransfer",
    outputs: [
      {
        internalType: "euint64",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "euint64",
        name: "amount",
        type: "bytes32",
      },
    ],
    name: "confidentialTransfer",
    outputs: [
      {
        internalType: "euint64",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "externalEuint64",
        name: "encryptedAmount",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "inputProof",
        type: "bytes",
      },
    ],
    name: "confidentialTransferFrom",
    outputs: [
      {
        internalType: "euint64",
        name: "transferred",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "euint64",
        name: "amount",
        type: "bytes32",
      },
    ],
    name: "confidentialTransferFrom",
    outputs: [
      {
        internalType: "euint64",
        name: "transferred",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "holder",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "isOperator",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        internalType: "uint48",
        name: "until",
        type: "uint48",
      },
    ],
    name: "setOperator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "externalEuint64",
        name: "encryptedAmount",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "inputProof",
        type: "bytes",
      },
    ],
    name: "unwrap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "euint64",
        name: "amount",
        type: "bytes32",
      },
    ],
    name: "unwrap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "confidentialTotalSupply",
    outputs: [
      {
        internalType: "euint64",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "rate",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "deploymentCoordinator",
    outputs: [
      {
        internalType: "contract IDeploymentCoordinator",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "holder",
        type: "address",
      },
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
    ],
    name: "isFinalizeUnwrapOperator",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        internalType: "uint48",
        name: "until",
        type: "uint48",
      },
    ],
    name: "setFinalizeUnwrapOperator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Returns the contract config to read an encrypted balance.
 *
 * @example
 * ```ts
 * const handle = await signer.readContract(
 *   confidentialBalanceOfContract(tokenAddress, userAddress),
 * );
 * ```
 */
export function confidentialBalanceOfContract(tokenAddress: Address, userAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "confidentialBalanceOf",
    args: [userAddress],
  } as const;
}

/**
 * Returns the contract config for a confidential transfer.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferContract(tokenAddress, to, handles[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferContract(
  encryptedErc20: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "confidentialTransfer",
    args: [to, toHex(handle), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for a confidential transferFrom.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferFromContract(tokenAddress, from, to, handles[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferFromContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "confidentialTransferFrom",
    args: [from, to, toHex(handle), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for checking operator status.
 *
 * @example
 * ```ts
 * const isApproved = await signer.readContract(
 *   isOperatorContract(tokenAddress, holder, spender),
 * );
 * ```
 */
export function isOperatorContract(tokenAddress: Address, holder: Address, spender: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "isOperator",
    args: [holder, spender],
  } as const;
}

/**
 * Returns the contract config for setting an operator.
 * Defaults timestamp to 1 hour from now.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   setOperatorContract(tokenAddress, spender),
 * );
 * ```
 */
export function setOperatorContract(tokenAddress: Address, spender: Address, timestamp?: number) {
  const until = timestamp ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "setOperator",
    args: [spender, until],
  } as const;
}

/**
 * Returns the contract config for an unwrap with newly encrypted amount.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   unwrapContract(encryptedErc20, from, to, handles[0], inputProof),
 * );
 * ```
 */
export function unwrapContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "unwrap",
    args: [from, to, toHex(encryptedAmount), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for an unwrap with an existing balance handle.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance),
 * );
 * ```
 */
export function unwrapFromBalanceContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: Handle,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "unwrap",
    args: [from, to, encryptedBalance],
  } as const;
}

/**
 * Returns the contract config to read the confidential (encrypted) total supply.
 *
 * @example
 * ```ts
 * const handle = await signer.readContract(
 *   confidentialTotalSupplyContract(tokenAddress),
 * );
 * ```
 */
export function confidentialTotalSupplyContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "confidentialTotalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the plaintext total supply.
 *
 * @example
 * ```ts
 * const supply = await signer.readContract(
 *   totalSupplyContract(tokenAddress),
 * );
 * ```
 */
export function totalSupplyContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "totalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the wrap/unwrap conversion rate.
 *
 * @example
 * ```ts
 * const rate = await signer.readContract(rateContract(tokenAddress));
 * ```
 */
export function rateContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "rate",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the deployment coordinator address.
 *
 * @example
 * ```ts
 * const coordinator = await signer.readContract(
 *   deploymentCoordinatorContract(tokenAddress),
 * );
 * ```
 */
export function deploymentCoordinatorContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "deploymentCoordinator",
    args: [],
  } as const;
}

/**
 * Returns the contract config to check finalizeUnwrap operator status.
 *
 * @example
 * ```ts
 * const isOp = await signer.readContract(
 *   isFinalizeUnwrapOperatorContract(tokenAddress, holder, operator),
 * );
 * ```
 */
export function isFinalizeUnwrapOperatorContract(
  tokenAddress: Address,
  holder: Address,
  operator: Address,
) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "isFinalizeUnwrapOperator",
    args: [holder, operator],
  } as const;
}

/**
 * Returns the contract config for setting a finalizeUnwrap operator.
 * Defaults timestamp to 1 hour from now.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   setFinalizeUnwrapOperatorContract(tokenAddress, operator),
 * );
 * ```
 */
export function setFinalizeUnwrapOperatorContract(
  tokenAddress: Address,
  operator: Address,
  timestamp?: number,
) {
  const until = timestamp ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "setFinalizeUnwrapOperator",
    args: [operator, until],
  } as const;
}
