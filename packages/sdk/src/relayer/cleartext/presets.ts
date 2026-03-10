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
  aclContractAddress: "0xCC505dF6f244AcBf12C915888eC046939a439dB5",
  executorAddress: "0xfeec4C7e8Ad0Af0F42b594A453F4dB6da01e21D6",
  // The values used when configuring the deployments are the same as those used for a hardhat deployment, since there's no gateway chain.
  verifyingContractAddressDecryption: HardhatConfig.verifyingContractAddressDecryption,
  verifyingContractAddressInputVerification:
    HardhatConfig.verifyingContractAddressInputVerification,
} satisfies CleartextConfig;
