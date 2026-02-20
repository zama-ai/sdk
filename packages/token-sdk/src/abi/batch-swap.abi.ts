export const BATCH_SWAP_ABI = [
  {
    inputs: [
      {
        internalType: "contract DeploymentCoordinator",
        name: "coordinator_",
        type: "address",
      },
      {
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "fromToken_",
        type: "address",
      },
      {
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "toToken_",
        type: "address",
      },
      {
        internalType: "contract ConfidentialWrapper",
        name: "fromWrapper_",
        type: "address",
      },
      {
        internalType: "contract ConfidentialWrapper",
        name: "toWrapper_",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "minBatchDuration_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "batchExpiry_",
        type: "uint256",
      },
      {
        internalType: "contract ISwapRoute",
        name: "swapRoute_",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "minDepositors_",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AlreadyClaimed",
    type: "error",
  },
  {
    inputs: [],
    name: "BatchExpiredBeforeDispatch",
    type: "error",
  },
  {
    inputs: [],
    name: "BatchNotDispatched",
    type: "error",
  },
  {
    inputs: [],
    name: "BatchNotExpiredOrFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "BatchNotFinalized",
    type: "error",
  },
  {
    inputs: [],
    name: "BatchNotOpen",
    type: "error",
  },
  {
    inputs: [],
    name: "ExchangeRateOverflow",
    type: "error",
  },
  {
    inputs: [],
    name: "FinalizeNotSupported",
    type: "error",
  },
  {
    inputs: [],
    name: "InsufficientEntropy",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidBatchExpiry",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidFromToken",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidMantissa",
    type: "error",
  },
  {
    inputs: [],
    name: "MinBatchDurationNotMet",
    type: "error",
  },
  {
    inputs: [],
    name: "NoDeposit",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [],
    name: "RouteInputMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "RouteOutputMismatch",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "SafeERC20FailedOperation",
    type: "error",
  },
  {
    inputs: [],
    name: "SenderNotAllowed",
    type: "error",
  },
  {
    inputs: [],
    name: "TokenTransferFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "UnknownWrapper",
    type: "error",
  },
  {
    inputs: [],
    name: "ZamaProtocolUnsupported",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroAddress",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroCTokenAmount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "plaintextAmount",
        type: "uint256",
      },
    ],
    name: "BatchDispatchCallback",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newBatchId",
        type: "uint256",
      },
    ],
    name: "BatchDispatched",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "BatchExpired",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "BatchFailed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "exchangeRate",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "mantissa",
        type: "uint64",
      },
    ],
    name: "BatchFinalized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "Claimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "startIndex",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "endIndex",
        type: "uint256",
      },
    ],
    name: "ClaimsPushed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "Deposited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "until",
        type: "uint48",
      },
    ],
    name: "FinalizeUnwrapOperatorUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferStarted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldRoute",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newRoute",
        type: "address",
      },
    ],
    name: "SwapRouteUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "TokensRescued",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "Withdrawn",
    type: "event",
  },
  {
    inputs: [],
    name: "acceptOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "batchExpiry",
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
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "confidentialProtocolId",
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
    name: "coordinator",
    outputs: [
      {
        internalType: "contract DeploymentCoordinator",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentBatchId",
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
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "dispatchBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "finalizeBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "fromToken",
    outputs: [
      {
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fromWrapper",
    outputs: [
      {
        internalType: "contract ConfidentialWrapper",
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
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "getBatch",
    outputs: [
      {
        internalType: "enum Batcher.BatchStatus",
        name: "status",
        type: "uint8",
      },
      {
        internalType: "uint256",
        name: "createdAt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "dispatchedAt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "totalDepositedPlaintext",
        type: "uint256",
      },
      {
        internalType: "uint64",
        name: "exchangeRate",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "mantissa",
        type: "uint64",
      },
      {
        internalType: "uint256",
        name: "depositCount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "unwrapRequestId",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "getDepositorCount",
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
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "getDepositors",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "hasDeposit",
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
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "isClaimable",
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
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "isClaimed",
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
    inputs: [],
    name: "minBatchDuration",
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
    name: "minDepositors",
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
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "euint64",
        name: "amount",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "onConfidentialTransferReceived",
    outputs: [
      {
        internalType: "ebool",
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
        name: "",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "euint64",
        name: "burntAmount",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "onUnwrapFinalizedReceived",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingOwner",
    outputs: [
      {
        internalType: "address",
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
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "startIndex",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "count",
        type: "uint256",
      },
    ],
    name: "pushClaims",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "recoverFailedBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "rescueTokens",
    outputs: [],
    stateMutability: "nonpayable",
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
  {
    inputs: [
      {
        internalType: "contract ISwapRoute",
        name: "newRoute",
        type: "address",
      },
    ],
    name: "setSwapRoute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "swapRoute",
    outputs: [
      {
        internalType: "contract ISwapRoute",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "toToken",
    outputs: [
      {
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "toWrapper",
    outputs: [
      {
        internalType: "contract ConfidentialWrapper",
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
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const;
