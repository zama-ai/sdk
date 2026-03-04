import deployments from "../../../../../hardhat/deployments.json" with { type: "json" };
import {
  GATEWAY_CHAIN_ID,
  MOCK_INPUT_SIGNER_PK,
  MOCK_KMS_SIGNER_PK,
  VERIFYING_CONTRACTS,
} from "./hardhat-constants";
import type { CleartextChainConfig } from "./types";

export { GATEWAY_CHAIN_ID, MOCK_INPUT_SIGNER_PK, MOCK_KMS_SIGNER_PK, VERIFYING_CONTRACTS };

export const hardhat = {
  chainId: 31_337n,
  gatewayChainId: GATEWAY_CHAIN_ID,
  rpcUrl: "http://127.0.0.1:8545",
  contracts: {
    acl: deployments.fhevm.acl,
    executor: deployments.fhevm.executor,
    inputVerifier: deployments.fhevm.inputVerifier,
    kmsVerifier: deployments.fhevm.kmsVerifier,
    verifyingInputVerifier: VERIFYING_CONTRACTS.inputVerification,
    verifyingDecryption: VERIFYING_CONTRACTS.decryption,
  },
} satisfies CleartextChainConfig;
