// ─── Network table ─────────────────────────────────────────────────────────────
// One row per network the app can run on. The picker, providers.tsx and the cards all
// read from here, so adding a network means adding a row (plus, for relayer-backed rows,
// an upstream entry in src/lib/relayers.ts).
import type { Address } from "@zama-fhe/sdk";
import {
  bscTestnet as fheBscTestnet,
  hoodi as fheHoodi,
  mainnet as fheMainnet,
  polygon as fhePolygon,
  polygonAmoy as fhePolygonAmoy,
  sepolia as fheSepolia,
  zenithTrexTestnet as fheZenith,
  type FheChain,
} from "@zama-fhe/sdk/chains";
import { defineChain, type Chain } from "viem";
import { bscTestnet, hoodi, mainnet, polygon, polygonAmoy, sepolia } from "viem/chains";

export interface Network {
  /** Shown in the network picker. Cleartext deployments say so here. */
  label: string;
  /** Wallet-facing chain. Carries the RPC override so the wallet's "add network" prompt matches. */
  chain: Chain;
  /** Zama protocol addresses from `@zama-fhe/sdk/chains`, with the same RPC override. */
  fhe: FheChain;
  /** `relayer`: `web()` through `/api/relayer/<key>`. `cleartext`: `cleartext()`, no relayer. */
  transport: "relayer" | "cleartext";
  explorerUrl: string;
  /** The test tokens expose `mint(address,uint256)`; real tokens do not. */
  canMint: boolean;
  /** ConfidentialVault demo (`confidentialTransferAndCall`). Deployed on Sepolia only. */
  vault?: { address: Address; confidentialToken: Address };
}

interface NetworkInput extends Omit<Network, "chain" | "fhe"> {
  chain: Chain;
  /** A preset from `@zama-fhe/sdk/chains`; every preset names its public RPC as a URL. */
  fhe: FheChain & { network: string };
  /** `NEXT_PUBLIC_<KEY>_RPC_URL`. Falls back to the preset's public RPC. */
  rpcUrl: string | undefined;
}

// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with "" at build time, not
// undefined, and "" is not nullish.
function defineNetwork({ chain, fhe, rpcUrl, ...rest }: NetworkInput): Network {
  const network = rpcUrl || fhe.network;
  return {
    ...rest,
    chain: defineChain({ ...chain, rpcUrls: { default: { http: [network] } } }),
    fhe: { ...fhe, network },
  };
}

// viem has no definition for T-Rex's Zenith testnet (Reth execution, Canton-mediated finality).
const zenith = defineChain({
  id: fheZenith.id,
  name: "T-Rex Zenith",
  nativeCurrency: { name: "Canton Coin", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: [fheZenith.network] } },
  testnet: true,
  blockExplorers: {
    default: { name: "Zenith Explorer", url: "https://explorer.testnet.t-rex.zenith.network" },
  },
});

export const networks = {
  sepolia: defineNetwork({
    label: "Sepolia",
    chain: sepolia,
    fhe: fheSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://eth-sepolia.blockscout.com",
    canMint: true,
    // A minimal confidential escrow bound to one confidential token (cUSDC). The vault
    // cards only render when that token is selected. See contracts/src/ConfidentialVault.sol.
    vault: {
      address: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
        "0xb13720bec167A576D715F5aA7C7d68b3dB0A4Ad7") as Address,
      confidentialToken: (process.env.NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN ||
        "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639") as Address,
    },
  }),
  "polygon-amoy": defineNetwork({
    label: "Polygon Amoy",
    chain: polygonAmoy,
    fhe: fhePolygonAmoy,
    rpcUrl: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://amoy.polygonscan.com",
    canMint: true,
  }),
  // Cleartext rows are development deployments: "encrypted" values are stored in cleartext
  // on-chain and there is no relayer or KMS. They exist to integrate against the SDK on
  // chains without the full FHE stack, not for production use.
  "bnb-testnet": defineNetwork({
    label: "BNB Testnet · Cleartext",
    chain: bscTestnet,
    fhe: fheBscTestnet,
    rpcUrl: process.env.NEXT_PUBLIC_BNB_TESTNET_RPC_URL,
    transport: "cleartext",
    explorerUrl: "https://testnet.bscscan.com",
    canMint: true,
  }),
  hoodi: defineNetwork({
    label: "Hoodi · Cleartext",
    chain: hoodi,
    fhe: fheHoodi,
    rpcUrl: process.env.NEXT_PUBLIC_HOODI_RPC_URL,
    transport: "cleartext",
    explorerUrl: "https://eth-hoodi.blockscout.com",
    canMint: true,
  }),
  zenith: defineNetwork({
    label: "T-Rex Zenith · Cleartext",
    chain: zenith,
    fhe: fheZenith,
    rpcUrl: process.env.NEXT_PUBLIC_ZENITH_RPC_URL,
    transport: "cleartext",
    explorerUrl: "https://explorer.testnet.t-rex.zenith.network",
    canMint: true,
  }),
  // Mainnet rows are listed only when the server has a relayer URL for them (see
  // src/lib/relayers.ts). Nothing points at mainnet by default.
  mainnet: defineNetwork({
    label: "Ethereum",
    chain: mainnet,
    fhe: fheMainnet,
    rpcUrl: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://etherscan.io",
    canMint: false,
  }),
  polygon: defineNetwork({
    label: "Polygon",
    chain: polygon,
    fhe: fhePolygon,
    rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://polygonscan.com",
    canMint: false,
  }),
} satisfies Record<string, Network>;

export type NetworkKey = keyof typeof networks;

/** Table order: the first key is the chain wagmi falls back to while no wallet is connected. */
export const NETWORK_KEYS = Object.keys(networks) as NetworkKey[];

export function networkForChain(chainId: number | undefined): NetworkKey | undefined {
  return NETWORK_KEYS.find((key) => networks[key].chain.id === chainId);
}
