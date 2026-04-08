import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { mainnet, sepolia, type Chain } from "viem/chains";

export type NetworkProfileName = "sepolia" | "mainnet";
export type ZamaSupportLevel = "SUPPORTED" | "EXPERIMENTAL";
type SdkPresetConfig = typeof SepoliaConfig | typeof MainnetConfig;

export interface RuntimeNetworkConfig {
  profile: NetworkProfileName;
  profileLabel: string;
  zamaSupport: ZamaSupportLevel;
  chain: Chain;
  chainId: number;
  rpcUrl: string;
  relayerUrl: string;
  apiKey: string;
  sdkConfig: SdkPresetConfig;
}

type NetworkPreset = {
  profileLabel: string;
  chain: Chain;
  sdkConfig: SdkPresetConfig;
  zamaSupport: ZamaSupportLevel;
  defaultRpcUrl: string;
  defaultRelayerUrl: string;
};

const NETWORK_PRESETS: Record<NetworkProfileName, NetworkPreset> = {
  sepolia: {
    profileLabel: "Ethereum Sepolia",
    chain: sepolia,
    sdkConfig: SepoliaConfig,
    zamaSupport: "SUPPORTED",
    defaultRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    defaultRelayerUrl: "https://relayer.testnet.zama.org/v2",
  },
  mainnet: {
    profileLabel: "Ethereum Mainnet",
    chain: mainnet,
    sdkConfig: MainnetConfig,
    zamaSupport: "EXPERIMENTAL",
    defaultRpcUrl: "https://ethereum-rpc.publicnode.com",
    defaultRelayerUrl: "",
  },
};

function nonEmpty(value: string | undefined): string {
  return (value ?? "").trim();
}

export function parseNetworkProfile(raw: string | undefined): NetworkProfileName {
  const normalized = nonEmpty(raw).toLowerCase();
  if (!normalized) return "sepolia";
  if (normalized === "sepolia") return "sepolia";
  if (normalized === "mainnet") return "mainnet";
  throw new Error(`Invalid NETWORK_PROFILE="${raw}". Expected one of: sepolia, mainnet.`);
}

export function buildNetworkConfig(env: NodeJS.ProcessEnv = process.env): RuntimeNetworkConfig {
  const profile = parseNetworkProfile(env.NETWORK_PROFILE);
  const preset = NETWORK_PRESETS[profile];

  const rpcUrl = nonEmpty(env.RPC_URL) || preset.defaultRpcUrl;
  if (!rpcUrl) {
    throw new Error(`RPC_URL is required for NETWORK_PROFILE=${profile}.`);
  }

  const relayerUrl = nonEmpty(env.RELAYER_URL) || preset.defaultRelayerUrl;
  if (!relayerUrl) {
    throw new Error(
      `RELAYER_URL is required for NETWORK_PROFILE=${profile}.` +
        " Provide your relayer endpoint in .env.",
    );
  }

  return {
    profile,
    profileLabel: preset.profileLabel,
    zamaSupport: preset.zamaSupport,
    chain: preset.chain,
    chainId: preset.chain.id,
    rpcUrl,
    relayerUrl,
    apiKey: nonEmpty(env.RELAYER_API_KEY),
    sdkConfig: preset.sdkConfig,
  };
}

/**
 * Runtime network configuration.
 *
 * `profile`     — selected logical profile (`sepolia` or `mainnet`)
 * `chain`       — viem chain object
 * `rpcUrl`      — JSON-RPC endpoint
 * `relayerUrl`  — Zama relayer base URL
 * `apiKey`      — x-api-key forwarded to the relayer
 * `sdkConfig`   — Zama SDK chain config preset
 * `zamaSupport` — harness support level for the selected profile
 */
export const networkConfig = buildNetworkConfig();
