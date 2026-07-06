import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia as viemSepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";
import type { AppConfig } from "./config.js";

/**
 * Builds the single ZamaSDK instance the server uses for the lifetime of the
 * process.
 *
 * Deliberately constructed with an accountless `walletClient` (no private
 * key, no `account`): the wrapper only ever calls `sdk.encrypt()`, which
 * talks to the relayer and never touches the configured signer. This is
 * what "no private key custody in the middleware" means in practice, not
 * just a design intention — see WALKTHROUGH.md for how this was verified
 * against the SDK source.
 */
export function createSdk(config: AppConfig): ZamaSDK {
  if (config.chainId !== sepolia.id) {
    throw new Error(
      `Unsupported chainId ${config.chainId}: this POC only wires the Sepolia FHE chain config (${sepolia.id}). ` +
        "Add another entry to @zama-fhe/sdk/chains usage in src/sdk.ts to support more networks.",
    );
  }

  const zamaChain = {
    ...sepolia,
    network: config.rpcUrl,
    ...(config.relayerApiKey && {
      auth: { __type: "ApiKeyHeader" as const, value: config.relayerApiKey },
    }),
  } as const satisfies FheChain;

  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain: viemSepolia, transport });
  // No `account`: this client can never sign or send transactions.
  const walletClient = createWalletClient({ chain: viemSepolia, transport });

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
