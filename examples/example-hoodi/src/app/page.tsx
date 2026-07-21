"use client";

import { ActionScreen, AppHeader, TokenSelector } from "@/components/PageChrome";
import { SelectedTokenPanel } from "@/components/SelectedTokenPanel";
import { HOODI_CHAIN_ID } from "@/lib/config";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { hoodi } from "viem/chains";
import { useBalance, useConnect, useConnection, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";

export default function Home() {
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isHoodi = chainId === HOODI_CHAIN_ID;

  // Fetch all valid token pairs from the on-chain WrappersRegistry. The registry address
  // is resolved automatically from the connected chain via DefaultRegistryAddresses
  // (Hoodi: 0x1807aE2f693F8530DFB126D0eF98F2F2518F292f) — no configuration required.
  // metadata: true fetches name/symbol/decimals on-chain for both tokens in each pair.
  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  // Keep only registered pairs with loaded metadata.
  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (pair): pair is TokenWrapperPairWithMetadata => pair.isValid && "underlying" in pair,
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

  // Native ETH balance via wagmi's useBalance — routed through the configured Hoodi
  // transport, so it stays independent of the injected wallet's own RPC endpoint.
  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: isConnected && isHoodi },
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title="Hoodi Confidential Token Quickstart"
        description="Connect your wallet to interact with ERC-7984 tokens on Hoodi testnet."
        actionLabel="Connect Wallet"
        pendingLabel="Connecting…"
        pending={isConnecting}
        onAction={() => connect({ connector: injected() })}
        error={
          isNoWallet
            ? "No Ethereum wallet found. Please install an EIP-1193 browser wallet."
            : connectError?.message
        }
      />
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isHoodi) {
    return (
      <ActionScreen
        title="Hoodi Network Required"
        description={`This app only works on Hoodi testnet (chain ID ${HOODI_CHAIN_ID}).`}
        actionLabel="Switch to Hoodi"
        pendingLabel="Switching…"
        pending={isSwitching}
        onAction={() => switchChain({ chainId: hoodi.id })}
        error={switchError && "Could not switch to Hoodi. Please switch manually in your wallet."}
      />
    );
  }

  // ── Screen 3: Connected on Hoodi — main UI ─────────────────────────────────
  return (
    <main className="app-container">
      <AppHeader
        title="Hoodi Confidential Token Quickstart"
        address={address}
        balanceLabel="ETH"
        balance={
          nativeBalance !== undefined ? Number(formatEther(nativeBalance.value)).toFixed(4) : "—"
        }
      />
      <TokenSelector
        value={selectedTokenAddress ?? ""}
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
          key={`${address}-${token.confidentialTokenAddress}`}
          token={token}
          validPairs={validPairs}
        />
      )}
    </main>
  );
}
