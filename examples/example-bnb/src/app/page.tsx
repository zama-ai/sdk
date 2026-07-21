"use client";

import { ActionScreen, AppHeader, TokenSelector } from "@/components/PageChrome";
import { SelectedTokenPanel } from "@/components/SelectedTokenPanel";
import { BSC_TESTNET_CHAIN_ID } from "@/lib/config";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { bscTestnet } from "viem/chains";
import { useBalance, useConnect, useConnection, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";

export default function Home() {
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isBnb = chainId === BSC_TESTNET_CHAIN_ID;

  // Registry address is resolved automatically from the connected chain via the
  // chain config we passed to createConfig (registryAddress: 0xc0E8B73b…).
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

  useEffect(() => {
    if (validPairs.length > 0 && selectedTokenAddress === null) {
      setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
    }
  }, [validPairs, selectedTokenAddress]);

  const token = validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress);

  // Native tBNB balance via wagmi's useBalance — routed through the configured BNB testnet
  // transport, so it stays independent of the injected wallet's own RPC endpoint.
  const { data: nativeBalance } = useBalance({ address, query: { enabled: isConnected && isBnb } });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title="BNB Confidential Token Quickstart"
        description="Connect your wallet to interact with ERC-7984 tokens on BNB Smart Chain Testnet."
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
  if (!isBnb) {
    return (
      <ActionScreen
        title="BNB Network Required"
        description={`This app only works on BNB Smart Chain Testnet (chain ID ${BSC_TESTNET_CHAIN_ID}).`}
        actionLabel="Switch to BNB"
        pendingLabel="Switching…"
        pending={isSwitching}
        onAction={() => switchChain({ chainId: bscTestnet.id })}
        error={switchError && "Could not switch to BNB. Please switch manually in your wallet."}
      />
    );
  }

  // ── Screen 3: Connected on BNB — main UI ─────────────────────────────────
  return (
    <main className="app-container">
      <AppHeader
        title="BNB Confidential Token Quickstart"
        address={address}
        balanceLabel="tBNB"
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
