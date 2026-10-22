/**
 * ABI for the vault batcher router, which fans one submission out across
 * several batchers. Transcribed by hand from `IVaultBatcherConfidentialRouter`
 * in zama-ai/confidential-defi at tag `oz-audit-20261016` (commit `d7cd0c8e`),
 * so `abi:check` does not cover it: compare against that ref when the router
 * changes. `onConfidentialTransferReceived` is omitted because a token calls
 * it, not the SDK; the router's custom errors are kept so its reverts decode
 * to a name.
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
  { type: "error", name: "InvalidTokenWrapperRegistry", inputs: [] },
  { type: "error", name: "MissingInputProof", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
  { type: "error", name: "ZamaProtocolUnsupported", inputs: [] },
  {
    type: "error",
    name: "UnlistedConfidentialToken",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
  },
] as const;
