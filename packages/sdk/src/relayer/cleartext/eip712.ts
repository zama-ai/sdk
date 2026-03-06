import type { TypedDataDomain } from "viem";

type DomainFactory = (chainId: number | bigint, verifyingContract: string) => TypedDataDomain;

const inputDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "InputVerification",
  version: "1",
  chainId: Number(chainId),
  verifyingContract: verifyingContract as `0x${string}`,
});

const decryptionDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "Decryption",
  version: "1",
  chainId: Number(chainId),
  verifyingContract: verifyingContract as `0x${string}`,
});

export const INPUT_VERIFICATION_EIP712 = {
  domain: inputDomain,
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
  domain: decryptionDomain,
  types: {
    PublicDecryptVerification: [
      { name: "ctHandles", type: "bytes32[]" },
      { name: "decryptedResult", type: "bytes" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const USER_DECRYPT_EIP712 = {
  domain: decryptionDomain,
  types: {
    UserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const DELEGATED_USER_DECRYPT_EIP712 = {
  domain: decryptionDomain,
  types: {
    DelegatedUserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
      { name: "delegatorAddress", type: "address" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;
