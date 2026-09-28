// ─── Zenith network configuration ─────────────────────────────────────────────
// T-Rex testnet on Zenith EVM (chain 936486; Reth execution, Canton-mediated finality) —
// cleartext FHEVM deployment from SDK-380. Development/integration setup, not intended for
// production use. Edit these values to target a different network.
import type { FheChain } from "@zama-fhe/sdk/chains";
import { defineChain } from "viem";

export const ZENITH_CHAIN_ID = 936486;
export const ZENITH_CHAIN_ID_HEX = `0x${ZENITH_CHAIN_ID.toString(16)}`; // "0xe4a26"
export const ZENITH_EXPLORER_URL = "https://explorer.testnet.t-rex.zenith.network";
const ZENITH_RPC_DEFAULT = "https://rpc.testnet.t-rex.zenith.network";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const ZENITH_RPC_URL = process.env.NEXT_PUBLIC_ZENITH_RPC_URL || ZENITH_RPC_DEFAULT;

export const zenith = defineChain({
  id: ZENITH_CHAIN_ID,
  name: "T-Rex Zenith",
  nativeCurrency: { name: "Canton Coin", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: [ZENITH_RPC_URL] } },
  blockExplorers: { default: { name: "Zenith Explorer", url: ZENITH_EXPLORER_URL } },
});

// Zama protocol addresses for the cleartext deployment on this chain. These mirror the
// `zenithTrexTestnet` preset in `@zama-fhe/sdk/chains`; once the example pins an SDK release
// that ships the preset, replace this object with `{ ...zenithTrexTestnet, network: ZENITH_RPC_URL }`.
export const zamaZenith = {
  id: ZENITH_CHAIN_ID,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: ZENITH_RPC_URL,
  aclContractAddress: "0x061AAc7aAACc98d8e30459d4D858DaB9b6F3bd23",
  kmsContractAddress: "0x85fBA21840059cB7E2E5BB7Fa2c5b2A324Ea7a7D",
  inputVerifierContractAddress: "0xE90965601D10D42D3d88486b47b0Caf12C5C9fDe",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0xde2e3948d35ef9C406A7317eAF332F3c2786a566",
  executorAddress: "0x6C5036A4ad55DBA8007ae82c4e9C123F143e53ab",
} as const satisfies FheChain;
