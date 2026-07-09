import type { FheChain } from "./types";

/**
 * Mainnet network configuration (chainId 1).
 */
export const mainnet = {
  id: 1,
  gatewayChainId: 261131,
  relayerUrl: "https://relayer.mainnet.zama.org",
  network: "https://ethereum-rpc.publicnode.com",
  aclContractAddress: "0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6",
  kmsContractAddress: "0x77627828a55156b04Ac0DC0eb30467f1a552BB03",
  inputVerifierContractAddress: "0xCe0FC2e05CFff1B719EFF7169f7D80Af770c8EA2",
  verifyingContractAddressDecryption: "0x0f6024a97684f7d90ddb0fAAD79cB15F2C888D24",
  verifyingContractAddressInputVerification: "0xcB1bB072f38bdAF0F328CdEf1Fc6eDa1DF029287",
  registryAddress: "0xeb5015fF021DB115aCe010f23F55C2591059bBA0",
} as const satisfies FheChain;

/**
 * Sepolia testnet network configuration (chainId 11155111).
 *
 * Contract addresses and `gatewayChainId` mirror the `sepolia` definition
 * exported from `@fhevm/sdk/chains`, flattened and extended like {@link mainnet}.
 */
export const sepolia = {
  id: 11155111,
  gatewayChainId: 10901,
  relayerUrl: "https://relayer.testnet.zama.org",
  network: "https://ethereum-sepolia-rpc.publicnode.com",
  aclContractAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  inputVerifierContractAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
  verifyingContractAddressDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
  verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
  registryAddress: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
} as const satisfies FheChain;

/**
 * Hoodi testnet configuration (chainId 560048).
 *
 * Hoodi does not have full FHE infrastructure — use with `cleartext()` transport.
 * Contract addresses match the cleartext deployment.
 */
export const hoodi = {
  id: 560048,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: "https://rpc.hoodi.ethpandaops.io",
  aclContractAddress: "0x6D3FAf6f86e1fF9F3B0831Dda920AbA1cBd5bd68",
  kmsContractAddress: "0x822BE20679CfAfdc352F05dEdfe12a07E912212e",
  inputVerifierContractAddress: "0xf3D9A51f32D9bC23E1eECb0fAbF1f1DA4d9Bba26",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0x1807aE2f693F8530DFB126D0eF98F2F2518F292f",
  executorAddress: "0xC316692627de536368d82e9121F1D44a550894E6",
} as const satisfies FheChain;

/**
 * T-Rex InGen testnet configuration (chainId 364301).
 *
 * InGen does not have full FHE infrastructure — use with `cleartext()` transport.
 * Contract addresses match the cleartext deployment.
 */
export const ingenTestnet = {
  id: 364301,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: "https://rpc.ingen.t-rex.network",
  aclContractAddress: "0x09a4710BfBe7B557cD5CFE88BB31e9b5b85C419b",
  kmsContractAddress: "0xd885DEa6a924785fCcdf9CE993FEe27EA11832e6",
  inputVerifierContractAddress: "0x90f05B10db153365D8cB143EA17f5E5714D0bCD5",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0x7FC3D79EF9d01fA318CF2Aa5D91dDC492383Be0F",
  executorAddress: "0x1B05DE5b67b8f8363DC04E3a5996a616f11f8C7B",
} as const satisfies FheChain;

/**
 * BNB Smart Chain testnet configuration (chainId 97, Chapel).
 *
 * BSC testnet does not have full FHE infrastructure — use with `cleartext()` transport.
 * Contract addresses match the cleartext deployment.
 */
export const bscTestnet = {
  id: 97,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: "https://bsc-testnet-rpc.publicnode.com",
  aclContractAddress: "0x52470e945521E247Cb4754088a836Dc4b838AFBE",
  kmsContractAddress: "0x788F5BB2d93aB4Cb67Fe2277757aE95006504F6F",
  inputVerifierContractAddress: "0x49e0BAB39904E4192c30CFB58573Cbe27B7E398E",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0xc0E8B73b1C58D846e1d4f8fAE2E1466C85BCeAeC",
  executorAddress: "0x5985e48689550c1b2893ABfBbe4cc0eE3A22cc54",
} as const satisfies FheChain;

/**
 * Hardhat local network configuration (chainId 31337).
 *
 * The addresses in this configuration must match those of your deployment.
 */
export const hardhat = {
  id: 31337,
  gatewayChainId: 654321,
  relayerUrl: "",
  network: "http://127.0.0.1:8545",
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  verifyingContractAddressDecryption: "0xEaaA2FC6BC259dF015Aa7Dc8e59e0B67df622721",
  verifyingContractAddressInputVerification: "0x6189F6c0c3E40B4a3c72ec86262295D78d845297",
  registryAddress: undefined,
  executorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
} as const satisfies FheChain;

/** Alias for {@link hardhat}. */
export const anvil = hardhat;

/**
 * Built-in chain configurations keyed by chain ID.
 */
export const chains: Record<number, FheChain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [hoodi.id]: hoodi,
  [ingenTestnet.id]: ingenTestnet,
  [bscTestnet.id]: bscTestnet,
  [hardhat.id]: hardhat,
} as const;
