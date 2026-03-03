import {
  FHEVM_ADDRESSES,
  GATEWAY_CHAIN_ID,
  VERIFYING_CONTRACTS,
} from "../constants";
import type { CleartextMockConfig } from "../types";

export const USER_ADDRESS = "0x1000000000000000000000000000000000000001";
export const CONTRACT_ADDRESS = "0x2000000000000000000000000000000000000002";

export const CLEAR_TEXT_MOCK_CONFIG: CleartextMockConfig = {
  chainId: 31_337n,
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclAddress: FHEVM_ADDRESSES.acl,
  executorProxyAddress: FHEVM_ADDRESSES.executor,
  inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
  kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
  verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
  verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
};
