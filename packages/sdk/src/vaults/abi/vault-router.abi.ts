/**
 * ABI for the confidential vault batcher router, which fans one submission out
 * across several batchers.
 *
 * Transcribed against the router deployed on mainnet and Sepolia, and limited
 * to what the SDK reaches for. `onConfidentialTransferReceived` is left out
 * because the SDK never calls it — a token does, on the SDK's behalf — and its
 * payload is encoded from `join`'s parameters, which are the same pair. The
 * errors kept are the ones a caller can actually meet; the constructor's own
 * revert is unreachable once the router is deployed.
 *
 * `pnpm abi:build` does not produce this file, unlike the other ABIs here: the
 * router's source is not part of this repo's Foundry project.
 */
export const vaultRouterAbi = [
  {
    type: "function",
    name: "join",
    inputs: [
      {
        name: "legs",
        type: "tuple[]",
        internalType: "struct IVaultBatcherConfidentialRouter.Allocation[]",
        components: [
          { name: "batcher", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "amount", type: "bytes32", internalType: "externalEuint64" },
        ],
      },
      { name: "inputProof", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "tokenWrapperRegistry",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract ITokenWrapperRegistry" }],
    stateMutability: "view",
  },
  { type: "error", name: "MissingInputProof", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
  { type: "error", name: "ZamaProtocolUnsupported", inputs: [] },
  {
    type: "error",
    name: "UnlistedConfidentialToken",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
  },
] as const;
