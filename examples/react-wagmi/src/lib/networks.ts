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
  sepolia as fheSepolia,
  zenithTrexTestnet as fheZenith,
  type FheChain,
} from "@zama-fhe/sdk/chains";
import { defineChain, getAddress, isAddress, type Chain } from "viem";
import { bscTestnet, hoodi, mainnet, polygon, sepolia } from "viem/chains";

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
  /** Confidential ERC-4626 vaults for the Vaults tab, each set by its two batchers. */
  vaults: BatchVault[];
}

export interface BatchVault {
  /** The chain the vault is on: the vault hooks read it and refuse writes from another chain. */
  chainId: number;
  depositBatcher: Address;
  redeemBatcher: Address;
}

interface NetworkInput extends Omit<Network, "chain" | "fhe" | "vaults"> {
  chain: Chain;
  /** A preset from `@zama-fhe/sdk/chains`; every preset names its public RPC as a URL. */
  fhe: FheChain & { network: string };
  /** `NEXT_PUBLIC_<KEY>_RPC_URL`. Falls back to the preset's public RPC. */
  rpcUrl: string | undefined;
  /** `NEXT_PUBLIC_<KEY>_VAULTS`, read with {@link vaultsFromEnv}. */
  vaults: Omit<BatchVault, "chainId">[];
}

// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with "" at build time, not
// undefined, and "" is not nullish.
function defineNetwork({ chain, fhe, rpcUrl, vaults, ...rest }: NetworkInput): Network {
  const network = rpcUrl || fhe.network;
  return {
    ...rest,
    chain: defineChain({ ...chain, rpcUrls: { default: { http: [network] } } }),
    fhe: { ...fhe, network },
    vaults: vaults.map((vault) => ({ ...vault, chainId: chain.id })),
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

// One `depositBatcher:redeemBatcher` pair per vault, comma-separated. The name is passed with
// the value because Next.js inlines a NEXT_PUBLIC_* variable only where the code names it.
function vaultsFromEnv(name: string, value: string | undefined): Omit<BatchVault, "chainId">[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [depositBatcher, redeemBatcher, ...rest] = entry.split(":").map((part) => part.trim());
      if (!depositBatcher || !redeemBatcher || rest.length > 0) {
        throw new Error(`${name}: expected depositBatcher:redeemBatcher, got "${entry}"`);
      }
      return {
        depositBatcher: envAddress(name, depositBatcher),
        redeemBatcher: envAddress(name, redeemBatcher),
      };
    });
}

// Checksummed, so query keys built from it match addresses the SDK returns.
function envAddress(name: string, value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${name} is not a valid address: ${value}`);
  }
  return getAddress(value);
}

export const networks = {
  sepolia: defineNetwork({
    label: "Sepolia",
    chain: sepolia,
    fhe: fheSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://eth-sepolia.blockscout.com",
    canMint: true,
    vaults: vaultsFromEnv("NEXT_PUBLIC_SEPOLIA_VAULTS", process.env.NEXT_PUBLIC_SEPOLIA_VAULTS),
  }),
  "bnb-testnet": defineNetwork({
    label: "BNB Testnet",
    chain: bscTestnet,
    fhe: fheBscTestnet,
    rpcUrl: process.env.NEXT_PUBLIC_BNB_TESTNET_RPC_URL,
    vaults: vaultsFromEnv(
      "NEXT_PUBLIC_BNB_TESTNET_VAULTS",
      process.env.NEXT_PUBLIC_BNB_TESTNET_VAULTS,
    ),
    transport: "relayer",
    explorerUrl: "https://testnet.bscscan.com",
    canMint: true,
  }),
  // Cleartext rows are development deployments: "encrypted" values are stored in cleartext
  // on-chain and there is no relayer or KMS. They exist to integrate against the SDK on
  // chains without the full FHE stack, not for production use.
  hoodi: defineNetwork({
    label: "Hoodi · Cleartext",
    chain: hoodi,
    fhe: fheHoodi,
    rpcUrl: process.env.NEXT_PUBLIC_HOODI_RPC_URL,
    vaults: vaultsFromEnv("NEXT_PUBLIC_HOODI_VAULTS", process.env.NEXT_PUBLIC_HOODI_VAULTS),
    transport: "cleartext",
    explorerUrl: "https://eth-hoodi.blockscout.com",
    canMint: true,
  }),
  zenith: defineNetwork({
    label: "T-Rex Zenith · Cleartext",
    chain: zenith,
    fhe: fheZenith,
    rpcUrl: process.env.NEXT_PUBLIC_ZENITH_RPC_URL,
    vaults: vaultsFromEnv("NEXT_PUBLIC_ZENITH_VAULTS", process.env.NEXT_PUBLIC_ZENITH_VAULTS),
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
    vaults: vaultsFromEnv("NEXT_PUBLIC_MAINNET_VAULTS", process.env.NEXT_PUBLIC_MAINNET_VAULTS),
    transport: "relayer",
    explorerUrl: "https://etherscan.io",
    canMint: false,
  }),
  polygon: defineNetwork({
    label: "Polygon",
    chain: polygon,
    fhe: fhePolygon,
    rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
    vaults: vaultsFromEnv("NEXT_PUBLIC_POLYGON_VAULTS", process.env.NEXT_PUBLIC_POLYGON_VAULTS),
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
