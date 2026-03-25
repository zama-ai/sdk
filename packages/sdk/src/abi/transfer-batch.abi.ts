export const transferBatcherAbi = [
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
        internalType: "struct ERC7984TransferBatcher.ConfidentialTransferInput[]",
        name: "transfers",
        type: "tuple[]",
      },
    ],
    name: "confidentialBatchTransfer",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;
