import type { CleartextInstanceConfig } from "./types";

export const hoodi = {
  network: "https://rpc.hoodi.ethpandaops.io",
  chainId: 560048,
  gatewayChainId: 10901,
  aclContractAddress: "0xCC505dF6f244AcBf12C915888eC046939a439dB5",
  cleartextExecutorAddress: "0xfeec4C7e8Ad0Af0F42b594A453F4dB6da01e21D6",
  kmsContractAddress: "0xdae4028BD86408F59Db79032EDd05170FE350c5d",
  inputVerifierContractAddress: "0x2cD198C290d8AD6C5F2020C35F7b5868b74bDD55",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} satisfies CleartextInstanceConfig;
