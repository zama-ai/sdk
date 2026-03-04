import type { CleartextChainConfig } from "./types";

export const hoodi = {
  chainId: 560048n,
  gatewayChainId: 10901,
  rpcUrl: "https://rpc.hoodi.ethpandaops.io",
  contracts: {
    acl: "0xe56F2576BF3f4E2C929064CBd11C0f806EEfA4A3",
    kmsVerifier: "0xd30087aE7F79c72eb78f458130369879cbf7b3fC",
    inputVerifier: "0x963928f4a3861239ae4E3b1C53691eaf8065Bf28",
    verifyingDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
    verifyingInputVerifier: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
    executor: "0x5Be76f3C86886827047430884a5a295348967682",
  },
} satisfies CleartextChainConfig;
