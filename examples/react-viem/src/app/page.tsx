"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, createPublicClient, http } from "viem";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { SelectedTokenPanel } from "@/components/SelectedTokenPanel";
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_RPC_URL,
  sepolia,
} from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

// Routes ETH balance reads through the direct Sepolia RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });

// Attempt to switch to Sepolia. If the network is unknown to the wallet (error 4902),
// prompt to add it. Errors from wallet_switchEthereumChain (including 4001 user rejection)
// are swallowed — the caller re-reads the current chainId to determine the outcome.
// Errors from wallet_addEthereumChain propagate to the caller.
async function switchToSepolia(ethereum: NonNullable<ReturnType<typeof getEthereumProvider>>) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    if ((err as { code: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [SEPOLIA_RPC_URL],
            blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
          },
        ],
      });
    }
    // wallet_switchEthereumChain errors other than 4902 (including 4001 rejection) are
    // intentionally ignored — chainId is re-read in the finally block of the caller.
  }
}

export default function Home() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Case-insensitive: some wallets return uppercase hex (e.g. "0xAA36A7" instead of "0xaa36a7").
  const isSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
  const queryClient = useQueryClient();

  // Fetch all valid token pairs from the on-chain WrappersRegistry.
  // Registry address is resolved automatically from the connected chain via DefaultRegistryAddresses
  // (Sepolia: 0x2f0750Bbb0A246059d80e94c454586a7F27a128e) — no configuration required.
  // metadata: true fetches name/symbol/decimals on-chain for both tokens in each pair,
  // removing the need for separate useMetadata calls.
  // isPending stays true until the first successful response — covers both the initial
  // disabled state (registry address not yet resolved internally) and the active-fetching state.
  // isLoading alone is insufficient: in TanStack Query v5, isLoading = isPending && isFetching,
  // so it is false when the query is disabled (enabled: false), causing a premature
  // "No tokens available" display before the chain ID has been resolved.
  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  // Filter pairs: keep only isValid pairs with metadata.
  // With viem contract reads, named fields (tokenAddress, confidentialTokenAddress, isValid) are
  // directly accessible — no normalizePair workaround needed (unlike EthersSigner).
  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (p): p is TokenWrapperPairWithMetadata => p.isValid && "underlying" in p,
      ),
    [pairsData],
  );

  // Auto-select the first valid pair once the registry resolves.
  useEffect(() => {
    if (validPairs.length > 0 && selectedTokenAddress === null) {
      setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
    }
  }, [validPairs, selectedTokenAddress]);

  // Currently selected token pair, or undefined while the registry is loading.
  const token = validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress);

  // Attempt to switch to Sepolia and update chainId based on the actual result.
  // Safe to call concurrently — duplicate calls are harmless (last write wins).
  async function handleSwitchToSepolia() {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    setIsSwitching(true);
    setSwitchFailed(false);
    try {
      await switchToSepolia(ethereum);
    } catch (err) {
      console.error("Failed to switch to Sepolia:", err);
    } finally {
      const current = (await ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(current);
      setIsSwitching(false);
      // If we're still on the wrong network after the attempt, tell the user.
      setSwitchFailed(current.toLowerCase() !== SEPOLIA_CHAIN_ID_HEX);
    }
  }

  // Detect existing connection on page load and listen for account/chain changes.
  // Note: providers.tsx has a second accountsChanged listener that manages the
  // ZamaProvider lifecycle (signer remount). This listener handles UI-level state only.
  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      setIsInitializing(false);
      return;
    }

    Promise.all([
      ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ])
      .then(([accounts, currentChainId]) => {
        setAddress(accounts[0] ?? null);
        setChainId(currentChainId);
      })
      .catch((err) => console.error("Failed to detect wallet state:", err))
      .finally(() => setIsInitializing(false));

    const handleAccountsChanged = (accounts: unknown) => {
      setAddress((accounts as string[])[0] ?? null);
      // MetaMask fires accountsChanged on page load for already-connected sites, before
      // the Promise.all above resolves. Re-fetch chainId here so we never end up with
      // address set but chainId null (which renders a persistent "Sepolia Required" screen).
      (ethereum.request({ method: "eth_chainId" }) as Promise<string>)
        .then(setChainId)
        .catch((err) => console.error("[chainId refresh] eth_chainId failed:", err));
      // Invalidate only balance queries — registry/metadata is address-independent.
      queryClient.invalidateQueries({ queryKey: ["eth-balance"] });
      queryClient.invalidateQueries({ queryKey: ["erc20-balance"] });
    };
    const handleChainChanged = (chainId: unknown) => setChainId(chainId as string);

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      setConnectError(
        "No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Rabby, MetaMask, or Phantom).",
      );
      return;
    }

    setConnectError(null);
    setIsConnecting(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];

      const currentChainId = (await ethereum.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ?? null);
      setChainId(currentChainId);
    } catch (err) {
      console.error("Failed to connect wallet:", err);
      setConnectError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    // Reads through the direct Sepolia RPC (fast, no wallet roundtrip).
    queryFn: () =>
      rpcClient.getBalance({ address: address! as Address }).then((b) => formatEther(b)),
    enabled: !!address && isSepolia,
  });

  // ── Screen 0: Initializing ────────────────────────────────────────────────
  // Shown while eth_accounts / eth_chainId are resolving — prevents a flash of
  // the "Connect Wallet" screen during the re-initialization that follows a
  // ZamaProvider remount (wallet switch or chain change).
  if (isInitializing) {
    return (
      <main className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
      </main>
    );
  }

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <main className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Sepolia testnet.
        </p>
        <form action={connect}>
          <button type="submit" className="btn btn-primary" disabled={isConnecting}>
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </form>
        {connectError && (
          <div className="alert alert-error card-status" role="alert">
            {connectError}
          </div>
        )}
      </main>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isSepolia) {
    return (
      <main className="app-container connect-screen">
        <h1>Sepolia Network Required</h1>
        <p className="subtitle">
          This app only works on the Sepolia testnet (chain ID {SEPOLIA_CHAIN_ID}). Switch your
          wallet to continue.
        </p>
        <form action={handleSwitchToSepolia}>
          <button type="submit" className="btn btn-primary" disabled={isSwitching}>
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </form>
        {switchFailed && (
          <div className="alert alert-error card-status" role="alert">
            Could not switch to Sepolia. Please switch manually in your wallet.
          </div>
        )}
      </main>
    );
  }

  // ── Screen 3: Connected on Sepolia — main UI ───────────────────────────────
  return (
    <main className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <p className="connected-address">
          Connected: <code>{address}</code>
        </p>
        <p className="connected-address">
          ETH: <output>{ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}</output>
        </p>
      </header>

      {/* Token selector — populated from the on-chain WrappersRegistry */}
      <section className="card" aria-labelledby="token-selector-title">
        <h2 className="card-title" id="token-selector-title">
          Token
        </h2>
        <label className="sr-only" htmlFor="token-selector">
          Confidential token
        </label>
        <select
          id="token-selector"
          className="select"
          value={selectedTokenAddress ?? ""}
          onChange={(e) => setSelectedTokenAddress(e.target.value as Address)}
          disabled={isRegistryPending || isRegistryError || validPairs.length === 0}
        >
          {(isRegistryPending || selectedTokenAddress === null) && (
            <option value="" disabled>
              {isRegistryPending || validPairs.length > 0 ? "Loading…" : "No tokens available"}
            </option>
          )}
          {validPairs.map((pair) => (
            <option key={pair.confidentialTokenAddress} value={pair.confidentialTokenAddress}>
              {pair.underlying.symbol}
            </option>
          ))}
        </select>
        {isRegistryPending && <output className="token-meta">Loading tokens from registry…</output>}
        {!isRegistryPending && isRegistryError && (
          <p className="token-meta" role="alert">
            Failed to load tokens from registry.
          </p>
        )}
        {!isRegistryPending && !isRegistryError && validPairs.length === 0 && (
          <p className="token-meta">No tokens available.</p>
        )}
      </section>

      {token && (
        <SelectedTokenPanel
          key={`${address}-${token.confidentialTokenAddress}`}
          address={address as Address}
          token={token}
          validPairs={validPairs}
          isSepolia={isSepolia}
          ethBalanceKey={ethBalanceKey}
        />
      )}
    </main>
  );
}
