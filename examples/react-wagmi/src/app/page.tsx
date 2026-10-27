"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useBalance, useConnect, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import {
  ActionScreen,
  AppHeader,
  MainnetBanner,
  NetworkPicker,
  TokenSelector,
} from "@/components/PageChrome";
import { NoTokenPanel, SelectedTokenPanel } from "@/components/SelectedTokenPanel";
import { useEnabledNetworks } from "@/lib/hooks";
import { networkForChain, networks } from "@/lib/networks";

const TITLE = "Confidential Token Quickstart";

export default function Home() {
  // ── Wagmi hooks — wallet state managed reactively by wagmi ──────────────────
  // The Zama wagmi config adapter subscribes to wagmi connection state internally,
  // so account and chain changes are handled automatically — no manual eth_accounts
  // polling or walletKey/refSeededRef remount pattern needed.
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  // Networks the server can serve: cleartext rows always, relayer rows only when it has a
  // relayer URL for them. Mainnet stays hidden until a deployment opts in.
  const {
    data: enabledNetworks = [],
    isPending: isNetworksPending,
    isFetching: isNetworksFetching,
    isError: isNetworksError,
    refetch: refetchNetworks,
  } = useEnabledNetworks();
  const activeKey = networkForChain(chainId);
  const activeNetwork = activeKey && enabledNetworks.includes(activeKey) ? activeKey : undefined;
  const network = activeNetwork && networks[activeNetwork];

  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  // The installed react-sdk resolves the registry from a chain id it caches for 30 s, so after a
  // switch the token list would keep showing the previous network's tokens. Drop that entry on
  // every chain change. Remove once the example installs a react-sdk that refetches it itself.
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.wrappersRegistry.chainId() });
  }, [chainId, queryClient]);

  // Fetch all valid token pairs from the on-chain WrappersRegistry. The registry address
  // comes from the connected chain's FHE config — no configuration required.
  // metadata: true fetches name/symbol/decimals on-chain for both tokens in each pair.
  // isPending stays true until the first successful response — covers both the initial
  // disabled state (registry address not yet resolved internally) and the active-fetching
  // state. isLoading alone is insufficient: in TanStack Query v5, isLoading = isPending &&
  // isFetching, so it is false while the query is disabled.
  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (pair): pair is TokenWrapperPairWithMetadata => pair.isValid && "underlying" in pair,
      ),
    [pairsData],
  );

  // The selected pair, falling back to the first one so a fresh load or a network switch
  // (which replaces the pair list) never leaves the selector empty.
  const token =
    validPairs.find((pair) => pair.confidentialTokenAddress === selectedTokenAddress) ??
    validPairs[0];

  // Native balance via the wagmi transport — auto-updates on account or chain switch. The
  // token panel refetches this same key after actions; useBalance shares wagmi's query
  // cache by key, so this header copy updates too.
  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: isConnected && network !== undefined },
  });

  const picker = (
    <NetworkPicker
      options={enabledNetworks}
      value={activeNetwork ?? ""}
      pending={isSwitching}
      onChange={(key) => switchChain({ chainId: networks[key].chain.id })}
      error={switchError && "Could not switch network. Please switch manually in your wallet."}
    />
  );

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    // wagmi surfaces ProviderNotFoundError when no injected wallet is available.
    // Cast to string: wagmi's error discriminant union doesn't include ProviderNotFoundError
    // but the injected() connector does throw it at runtime when window.ethereum is absent.
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title={TITLE}
        description="Connect your wallet to interact with ERC-7984 confidential tokens."
        actionLabel="Connect Wallet"
        pendingLabel="Connecting…"
        pending={isConnecting}
        onAction={() => connect({ connector: injected() })}
        error={
          isNoWallet
            ? "No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Rabby, MetaMask, or Phantom)."
            : connectError?.message
        }
      />
    );
  }

  // ── Screen 2: Unsupported network — pick one ──────────────────────────────
  if (!network) {
    // Without the list, nothing is known about the wallet's chain, so don't call it unsupported.
    if (isNetworksError) {
      return (
        <ActionScreen
          title="Choose a Network"
          description="Could not load the networks this app can serve."
          actionLabel="Retry"
          pendingLabel="Retrying…"
          pending={isNetworksFetching}
          onAction={() => void refetchNetworks()}
        />
      );
    }
    // A chain in the table that this deployment does not serve: typically mainnet with no
    // relayer configured. Say so, instead of calling the chain unsupported.
    const unserved = activeKey && !isNetworksPending ? networks[activeKey] : undefined;
    return (
      <main className="app-container connect-screen">
        <section aria-labelledby="choose-network-title">
          <h1 id="choose-network-title">Choose a Network</h1>
          <p className="subtitle">
            {isNetworksPending
              ? "Loading networks…"
              : unserved
                ? `This deployment does not serve ${unserved.label}. Pick another network to switch.`
                : `Your wallet is on an unsupported network (chain ID ${chainId}). Pick one to switch.`}
          </p>
          {unserved?.transport === "relayer" && (
            <p className="token-meta">
              Encrypting and decrypting on {unserved.label} needs a relayer this app can reach. To
              run it yourself, set the relayer URL in the server environment: either Zama's relayer
              with an{" "}
              <a href="https://docs.zama.org/protocol/sdk/guides/relayer-api-keys">API key</a> or a{" "}
              <a href="https://github.com/zama-ai/fhevm/blob/main/relayer/docs/SELF_HOSTING.md">
                relayer you host
              </a>
              .
            </p>
          )}
          {picker}
        </section>
      </main>
    );
  }

  // ── Screen 3: Connected on a supported network — main UI ──────────────────
  return (
    <main className="app-container">
      {/* viem marks every testnet; the rows without the flag are the mainnets. */}
      {!network.chain.testnet && <MainnetBanner label={network.label} />}
      <AppHeader
        title={TITLE}
        address={address}
        balanceLabel={network.chain.nativeCurrency.symbol}
        balance={
          nativeBalance !== undefined ? Number(formatEther(nativeBalance.value)).toFixed(4) : "—"
        }
        onDisconnect={() => disconnect()}
        disconnecting={isDisconnecting}
      />
      {picker}
      <TokenSelector
        value={token?.confidentialTokenAddress ?? ""}
        options={validPairs.map((pair) => ({
          address: pair.confidentialTokenAddress,
          symbol: pair.underlying.symbol,
        }))}
        pending={isRegistryPending}
        error={isRegistryError}
        onChange={(event) => setSelectedTokenAddress(event.currentTarget.value as Address)}
      />

      {token && (
        <SelectedTokenPanel
          key={`${chainId}-${address}-${token.confidentialTokenAddress}`}
          token={token}
          validPairs={validPairs}
        />
      )}
      {!token && !isRegistryPending && <NoTokenPanel />}
    </main>
  );
}
