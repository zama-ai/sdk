import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as viemSepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";
import type { AppConfig } from "./config.js";

/**
 * Unlike `zama-json-rpc` (write-side), this service is constructed with a
 * REAL account: `sdk.decryption.delegatedDecryptValues()` requires a
 * configured signer whose address is the delegate that token holders have
 * granted decrypt rights to (`requireAlignedWalletAccount` in the SDK
 * source throws immediately without one). This is genuine custody — the
 * private key must be kept secure (HSM/vault in production; a plain env
 * var here is POC-only) — see WALKTHROUGH.md ("custody model").
 */
export function createSdk(config: AppConfig): ZamaSDK {
  if (config.chainId !== sepolia.id) {
    throw new Error(
      `Unsupported chainId ${config.chainId}: this POC only wires the Sepolia FHE chain config (${sepolia.id}).`,
    );
  }

  const zamaChain = {
    ...sepolia,
    network: config.rpcUrl,
    ...(config.relayerApiKey && {
      auth: { __type: "ApiKeyHeader" as const, value: config.relayerApiKey },
    }),
  } as const satisfies FheChain;

  const account = privateKeyToAccount(config.operationalPrivateKey);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain: viemSepolia, transport });
  const walletClient = createWalletClient({ account, chain: viemSepolia, transport });

  return new ZamaSDK(
    createConfig({
      chains: [zamaChain],
      publicClient,
      walletClient,
      storage: new MemoryStorage(),
      relayers: { [zamaChain.id]: node() },
    }),
  );
}
