"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { useBalance, useConnect, useConnection, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { TokenWorkspace, NoTokenWorkspace } from "@/components/TokenWorkspace";
import { sepoliaChain, SEPOLIA_CHAIN_ID } from "@/lib/config";

export default function Home() {
  // ── Wagmi hooks — wallet state managed reactively by wagmi ──────────────────
  // The Zama wagmi config adapter subscribes to wagmi connection state internally,
  // so account and chain changes are handled automatically — no manual eth_accounts
  // polling or walletKey/refSeededRef remount pattern needed.
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

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
  // With WagmiSigner (viem-based), named fields (tokenAddress, confidentialTokenAddress, isValid)
  // are directly accessible — no normalizePair workaround needed (unlike EthersSigner).
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

  // ETH balance via wagmi transport (SEPOLIA_RPC_URL) — auto-updates on account switch.
  // The workspace panel refetches this same key after actions; useBalance shares wagmi's
  // query cache by key, so this header copy updates too.
  const { data: ethBalanceData } = useBalance({
    address,
    query: { enabled: isConnected && isSepolia },
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected) {
    // wagmi surfaces ProviderNotFoundError when no injected wallet is available.
    // Cast to string: wagmi's error discriminant union doesn't include ProviderNotFoundError
    // but the injected() connector does throw it at runtime when window.ethereum is absent.
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <main className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Sepolia testnet.
        </p>
        <form action={() => connect({ connector: injected() })}>
          <button type="submit" className="btn btn-primary" disabled={isConnecting}>
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </form>
        {isNoWallet && (
          <div className="alert alert-error card-status" role="alert">
            No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Rabby,
            MetaMask, or Phantom).
          </div>
        )}
        {connectError && !isNoWallet && (
          <div className="alert alert-error card-status" role="alert">
            {connectError.message}
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
        <form action={() => switchChain({ chainId: sepoliaChain.id })}>
          <button type="submit" className="btn btn-primary" disabled={isSwitching}>
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </form>
        {switchError && (
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
          ETH:{" "}
          <output>
            {ethBalanceData !== undefined
              ? Number(formatEther(ethBalanceData.value)).toFixed(4)
              : "—"}
          </output>
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
          onChange={(e) => {
            setSelectedTokenAddress(e.target.value as Address);
          }}
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
        <TokenWorkspace
          key={`${address}-${token.confidentialTokenAddress}`}
          token={token}
          validPairs={validPairs}
        />
      )}
      {!token && !isRegistryPending && <NoTokenWorkspace />}
    </main>
  );
}
