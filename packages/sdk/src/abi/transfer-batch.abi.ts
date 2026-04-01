export const transferBatcherAbi = [
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
    anonymous: false,
    inputs: [],
    name: "BatchTransferStart",
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
    ],
    name: "BatchTransferEnd",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "contract IERC7984",
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
        internalType: "struct ERC7984TransferBatcher.ConfidentialTransferInput[]",
        name: "transfers",
        type: "tuple[]",
      },
    ],
    name: "confidentialBatchTransfer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
