import deployments from "../../../../../hardhat/deployments.json" with { type: "json" };
import type { CleartextChainConfig } from "./types";

export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;

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
