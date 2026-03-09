import { HardhatConfig } from "../relayer-utils";
import type { CleartextConfig } from "./types";

export const hardhatCleartextConfig = {
  chainId: 31337,
  network: "http://127.0.0.1:8545",
  gatewayChainId: HardhatConfig.gatewayChainId,
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  verifyingContractAddressDecryption: HardhatConfig.verifyingContractAddressDecryption,
  verifyingContractAddressInputVerification:
    HardhatConfig.verifyingContractAddressInputVerification,
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
