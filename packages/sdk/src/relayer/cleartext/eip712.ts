import type { Address } from "viem";

// Minimal EIP-712 definitions the off-chain cleartext relayer signs itself:
//   - `CiphertextVerification` (domain `InputVerification`) for the mock input
//     proof, verified on-chain by the InputVerifier during a partner's tx.
//   - `PublicDecryptVerification` (domain `Decryption`) for the mock KMS
//     signature over a public-decrypt result.
//
// The (delegated) user-decrypt permit EIP-712 is NOT defined here — that is
// produced by the delegated `@fhevm/sdk` client (`signDecryptionPermit`), which
// owns the versioned permit shape. Type strings + domains are byte-compatible
// with `forge-fhevm` (InputProofHelper / KMSDecryptionProofHelper).

export const INPUT_VERIFICATION_EIP712 = {
  domain: (chainId: number | bigint, verifyingContract: Address) => ({
    name: "InputVerification",
    version: "1",
    chainId: BigInt(chainId),
    verifyingContract,
  }),
  types: {
    CiphertextVerification: [
      { name: "ctHandles", type: "bytes32[]" },
      { name: "userAddress", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "contractChainId", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const KMS_DECRYPTION_EIP712 = {
  domain: (chainId: number | bigint, verifyingContract: Address) => ({
    name: "Decryption",
    version: "1",
    chainId: BigInt(chainId),
    verifyingContract,
  }),
  types: {
    PublicDecryptVerification: [
      { name: "ctHandles", type: "bytes32[]" },
      { name: "decryptedResult", type: "bytes" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;
