import type { ethers } from "ethers";

type DomainFactory = (chainId: number | bigint, verifyingContract: string) => ethers.TypedDataDomain;

const inputDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "InputVerification",
  version: "1",
  chainId,
  verifyingContract,
});

const decryptionDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "Decryption",
  version: "1",
  chainId,
  verifyingContract,
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
