import { sepolia } from "viem/chains";
import { SepoliaConfig } from "@zama-fhe/sdk";

const RPC_URL = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const RELAYER_URL = process.env.RELAYER_URL ?? "https://relayer.testnet.zama.org/v2";

const RELAYER_API_KEY = process.env.RELAYER_API_KEY ?? "";

/**
 * Runtime network configuration.
 *
 * v1 supports Sepolia only.
 * `chain`      — viem chain object (used by wallet/public clients)
 * `rpcUrl`     — JSON-RPC endpoint
 * `relayerUrl` — Zama relayer base URL
 * `apiKey`     — x-api-key forwarded to the relayer (empty = no header sent)
 * `sdkConfig`  — Zama SDK FhevmInstanceConfig preset (SepoliaConfig)
 * `chainId`    — numeric chain ID (11155111)
 */
export const networkConfig = {
  chain: sepolia,
  rpcUrl: RPC_URL,
  relayerUrl: RELAYER_URL,
  apiKey: RELAYER_API_KEY,
  sdkConfig: SepoliaConfig,
  chainId: sepolia.id,
} as const;
