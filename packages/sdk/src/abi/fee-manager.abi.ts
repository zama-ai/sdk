export const feeManagerAbi = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "wrapFrom",
        type: "address",
      },
      {
        internalType: "address",
        name: "wrapTo",
        type: "address",
      },
    ],
    name: "getWrapFee",
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
        internalType: "uint64",
        name: "amount",
        type: "uint64",
      },
      {
        internalType: "address",
        name: "unwrapFrom",
        type: "address",
      },
      {
        internalType: "address",
        name: "unwrapTo",
        type: "address",
      },
    ],
    name: "getUnwrapFee",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBatchTransferFee",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getFeeRecipient",
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
] as const;
