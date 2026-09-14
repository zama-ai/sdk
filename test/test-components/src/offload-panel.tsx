"use client";

import { anvil as anvilFheChain, ZamaSDK, type Address, type FheChain } from "@zama-fhe/sdk";
import { polygonAmoy, sepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { useState } from "react";
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil as anvilChain } from "viem/chains";

// Anvil account #0. Nothing is signed here; the config just requires a wallet.
const STUB_ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

/** Open testnets whose hosted relayer needs no API key. */
export const LIVE_CHAIN_NAMES = ["sepolia", "polygonAmoy"] as const;

export type LiveChainName = (typeof LIVE_CHAIN_NAMES)[number];

export function isLiveChainName(value: string | undefined): value is LiveChainName {
  return !!value && (LIVE_CHAIN_NAMES as readonly string[]).includes(value);
}

/** A confidential token registered on each live chain, used as the proof's contract binding. */
const LIVE_CHAINS: Record<LiveChainName, { chain: FheChain; contractAddress: Address }> = {
  sepolia: { chain: sepolia, contractAddress: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" },
  polygonAmoy: {
    chain: polygonAmoy,
    contractAddress: "0x7a1728f2A07cE4D62167dE1348af168509011b7b",
  },
};

/** Parameters passed through to `web()`; identical in both scenarios. */
type OffloadOptions = NonNullable<Parameters<typeof web>[0]>;

interface Scenario {
  readonly config: ReturnType<typeof createConfig>;
  readonly contractAddress: Address;
  readonly userAddress: Address;
  /**
   * Resolve the FHE key in its own stage before encrypting, so the liveness spec
   * can trust the boundary: everything after `encrypting` is worker work.
   */
  readonly prefetchKey: boolean;
}

/** Real testnet RPC and hosted relayer, throwaway account: the path is read-only. */
function liveScenario(liveChain: LiveChainName, offload: OffloadOptions): Scenario {
  const { chain, contractAddress } = LIVE_CHAINS[liveChain];
  const account = privateKeyToAccount(generatePrivateKey());
  const transport = http(String(chain.network));
  return {
    config: createConfig({
      chains: [chain],
      relayers: { [chain.id]: web(offload) },
      publicClient: createPublicClient({ transport }),
      walletClient: createWalletClient({ account, transport }),
    }),
    contractAddress,
    userAddress: account.address,
    prefetchKey: true,
  };
}

/** Local anvil plus a same-origin relayer base Playwright fulfills; no real key. */
function stubScenario(rpcUrl: string, relayerUrl: string, offload: OffloadOptions): Scenario {
  const chain: FheChain = { ...anvilFheChain, network: rpcUrl, relayerUrl };
  const transport = http(rpcUrl);
  return {
    config: createConfig({
      chains: [chain],
      relayers: { [chain.id]: web(offload) },
      publicClient: createPublicClient({ chain: anvilChain, transport }),
      walletClient: createWalletClient({ account: STUB_ACCOUNT, chain: anvilChain, transport }),
    }),
    contractAddress: "0x1111111111111111111111111111111111111111",
    userAddress: "0x2222222222222222222222222222222222222222",
    prefetchKey: false,
  };
}

export interface OffloadPanelProps {
  /** Opt into the live testnet path; omitted, the panel stays on the local stub setup. */
  readonly liveChain?: LiveChainName;
  /**
   * Spawns a busy-loop stand-in for the SDK's encrypt worker, used by `?fakeWorker=1`.
   * The app owns the factory because the worker chunk is the app bundler's to emit.
   */
  readonly fakeWorker?: () => Worker;
}

/**
 * Drives the real `web()` transport so the encrypt worker actually spawns in
 * the bundled app. Without `liveChain`, the relayer is same-origin and served
 * by Playwright route interception, so no real relayer or FHE key is involved.
 */
export function OffloadPanel({ liveChain, fakeWorker }: OffloadPanelProps = {}) {
  const [status, setStatus] = useState("idle");

  const run = async (offloadEncrypt: "auto" | true) => {
    setStatus("running");
    // Read at click time, never during SSR. The anvil port differs per
    // Playwright project, so the spec passes it as `?rpcPort=`.
    const params = new URLSearchParams(window.location.search);
    const rpcPort = params.get("rpcPort") ?? "8545";
    const rpcUrl = `http://127.0.0.1:${rpcPort}`;
    // `?workerSrc=` points the offload at a URL that cannot load, which is how
    // the spec reproduces a worker the bundler failed to serve. `?fakeWorker=1`
    // swaps in the app's busy-loop worker instead of the SDK's own.
    const offloadWorker =
      params.get("fakeWorker") && fakeWorker ? fakeWorker : (params.get("workerSrc") ?? undefined);
    // Same-origin relayer base: Playwright fulfills `v2/keyurl` and the key
    // bytes it points at.
    const relayerUrl = `${window.location.origin}/fake-relayer/`;
    const offload: OffloadOptions = { offloadEncrypt, offloadWorker };
    try {
      const scenario = liveChain
        ? liveScenario(liveChain, offload)
        : stubScenario(rpcUrl, relayerUrl, offload);
      const sdk = new ZamaSDK(scenario.config);
      if (scenario.prefetchKey) {
        // The worker's own init then resolves this key from the cache.
        setStatus("fetching-key");
        await sdk.relayer.fetchFheEncryptionKeyBytes();
        setStatus("encrypting");
      }
      await sdk.encrypt({
        values: [{ value: 7n, type: "euint64" }],
        contractAddress: scenario.contractAddress,
        userAddress: scenario.userAddress,
      });
      setStatus("encrypted");
    } catch (error) {
      // The whole cause chain: the interesting name is often the wrapped one.
      const parts: string[] = [];
      for (let e: unknown = error; e instanceof Error; e = e.cause) {
        parts.push(`${e.name}: ${e.message}`);
      }
      setStatus(`error: ${parts.join(" <- ") || String(error)}`);
    }
  };

  return (
    <section className="space-y-2" data-testid="offload-panel">
      <h2 className="text-xl font-semibold text-white">Encrypt offload</h2>
      <p data-testid="offload-mode">{liveChain ?? "stub"}</p>
      <button
        onClick={() => void run("auto")}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded"
        data-testid="offload-auto-button"
      >
        Encrypt (auto)
      </button>
      <button
        onClick={() => void run(true)}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded"
        data-testid="offload-strict-button"
      >
        Encrypt (strict)
      </button>
      <p data-testid="offload-status">{status}</p>
    </section>
  );
}
