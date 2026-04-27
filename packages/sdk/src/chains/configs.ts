import type { FheChain } from "./types";

/**
 * Mainnet network configuration (chainId 1).
 *
 * Contract addresses mirror `MainnetConfigV2` from `@zama-fhe/relayer-sdk`.
 * They are duplicated here because the `/bundle` export path only exposes
 * types at build time (runtime values require `/web` or `/node` which pull
 * in WASM). `satisfies FheChain` ensures structural drift is caught at
 * compile time.
 */
export const mainnet = {
  id: 1,
  gatewayChainId: 261131,
  relayerUrl: "https://relayer.mainnet.zama.org/v2",
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
 */
export const sepolia = {
  id: 11155111,
  gatewayChainId: 10901,
  relayerUrl: "https://relayer.testnet.zama.org/v2",
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
  kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0x1807aE2f693F8530DFB126D0eF98F2F2518F292f",
  executorAddress: "0xC316692627de536368d82e9121F1D44a550894E6",
} as const satisfies FheChain;

/**
 * Hardhat local network configuration (chainId 31337).
 *
 * The addresses in this configuration must match those of your deployment.
 */
export const hardhat = {
  id: 31337,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: "http://127.0.0.1:8545",
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
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
  [hardhat.id]: hardhat,
} as const;
