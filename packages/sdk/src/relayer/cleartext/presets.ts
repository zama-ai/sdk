import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "./constants";
import type { CleartextConfig } from "./types";

export const HardhatCleartextConfig = {
  chainId: 31337,
  network: "http://127.0.0.1:8545",
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
  cleartextExecutorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
} satisfies CleartextConfig;

export const hoodiCleartextConfig = {
  chainId: 560048,
  network: "https://rpc.hoodi.ethpandaops.io",
  gatewayChainId: 10901,
  aclContractAddress: "0xCC505dF6f244AcBf12C915888eC046939a439dB5",
  cleartextExecutorAddress: "0xfeec4C7e8Ad0Af0F42b594A453F4dB6da01e21D6",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} satisfies CleartextConfig;
