import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../constants";
import type { CleartextInstanceConfig } from "../types";

// Deterministic Hardhat deployment addresses (from FHEVMHostAddresses.sol).
// Hardcoded here instead of importing from deployments.json so the SDK
// unit tests have no dependency on the hardhat package.
export const TEST_FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
} as const;

export const USER_ADDRESS = "0x1000000000000000000000000000000000000001";
export const CONTRACT_ADDRESS = "0x2000000000000000000000000000000000000002";

export const CLEAR_TEXT_MOCK_CONFIG: CleartextInstanceConfig = {
  network: "http://127.0.0.1:8545",
  chainId: 31_337,
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclContractAddress: TEST_FHEVM_ADDRESSES.acl,
  cleartextExecutorAddress: TEST_FHEVM_ADDRESSES.executor,
  verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
  verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
};
