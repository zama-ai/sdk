import { HardhatConfig } from "../relayer-utils";
import type { CleartextConfig } from "./types";

/**
 * Hardhat local network configuration (chainId 31337).
 *
 * The addresses in this configuration must match those of your deployment.
 * Ensure that the executor address and other contract addresses correspond to
 * the contracts deployed on your Hardhat network.
 */
export const hardhatCleartextConfig = {
  ...HardhatConfig,
  executorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
} satisfies CleartextConfig;

export const hoodiCleartextConfig = {
  chainId: 560048,
  network: "https://rpc.hoodi.ethpandaops.io",
  gatewayChainId: HardhatConfig.gatewayChainId,
  aclContractAddress: "0x6D3FAf6f86e1fF9F3B0831Dda920AbA1cBd5bd68",
  executorAddress: "0xC316692627de536368d82e9121F1D44a550894E6",
  // The values used when configuring the deployments are the same as those used for a hardhat deployment, since there's no gateway chain.
  verifyingContractAddressDecryption: HardhatConfig.verifyingContractAddressDecryption,
  verifyingContractAddressInputVerification:
    HardhatConfig.verifyingContractAddressInputVerification,
  registryAddress: undefined,
} satisfies CleartextConfig;
