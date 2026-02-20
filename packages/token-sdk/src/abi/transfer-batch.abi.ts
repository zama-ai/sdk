export const TRANSFER_BATCHER_ABI = [
  {
    inputs: [
      {
        internalType: "contract AdminProvider",
        name: "adminProvider_",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
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
    name: "ERC7984UnauthorizedSpender",
    type: "error",
  },
  {
    inputs: [],
    name: "EmptyTransferArray",
    type: "error",
  },
  {
    inputs: [],
    name: "FeeTransferFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "InsufficientFee",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyOriginalSenderCanRetry",
    type: "error",
  },
  {
    inputs: [],
    name: "ZamaProtocolUnsupported",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "cToken",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "startTxId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "endTxId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "fee",
        type: "uint256",
      },
    ],
    name: "BatchTransfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "cToken",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "originalTxId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "retryTxId",
        type: "uint256",
      },
    ],
    name: "RetryTransfer",
    type: "event",
  },
  {
    inputs: [],
    name: "adminProvider",
    outputs: [
      {
        internalType: "contract AdminProvider",
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
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "cToken",
        type: "address",
      },
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        components: [
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
          {
            internalType: "uint256",
            name: "retryFor",
            type: "uint256",
          },
        ],
        internalType:
          "struct ERC7984TransferBatcher.ConfidentialTransferInput[]",
        name: "transfers",
        type: "tuple[]",
      },
    ],
    name: "confidentialBatchTransfer",
    outputs: [],
    stateMutability: "payable",
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
    inputs: [
      {
        internalType: "address",
        name: "cToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "txId",
        type: "uint256",
      },
    ],
    name: "txIdToSender",
    outputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
