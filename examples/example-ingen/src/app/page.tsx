"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useBalance, useConnection, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata, Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { ActionScreen, AppHeader, TokenSelector } from "@/components/PageChrome";
import { ingen, INGEN_CHAIN_ID } from "@/lib/config";
import { erc20BalanceKey } from "@/lib/queryKeys";

interface SelectedTokenPanelProps {
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
}

function SelectedTokenPanel({ token, validPairs }: SelectedTokenPanelProps) {
  const queryClient = useQueryClient();
  // Wallet state read straight from wagmi in place — nothing wallet-derived is passed in.
  const { address, chainId } = useConnection(); // Native balance lives in the header, but its refetch is triggered here after a mint;
  // useBalance shares wagmi's query cache by key, so the header's copy updates too.
  const { refetch: refetchNativeBalance } = useBalance({ address });

  if (!address) return null;

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey(token.tokenAddress, address) });
    void refetchNativeBalance();
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialBalance.token(token.confidentialTokenAddress),
    });
  };

  const actionsDisabled = chainId !== INGEN_CHAIN_ID;

  return (
    <>
      <BalancesCard
        token={token}
        account={address}
        validPairs={validPairs}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          token={pair}
          onSuccess={refreshBalances}
        />
      ))}

      <h2 className="section-label">Operations</h2>

      <ShieldCard
        key={`shield-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <TransferCard
        key={`transfer-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <h2 className="section-label">Delegation — as owner</h2>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={actionsDisabled}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={actionsDisabled}
      />

      <h2 className="section-label">Delegation — as delegate</h2>

      <DecryptAsCard
        key={`decrypt-as-${address}-${token.confidentialTokenAddress}`}
        token={token}
        account={address}
        disabled={actionsDisabled}
      />
    </>
  );
}

export default function Home() {
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isIngen = chainId === INGEN_CHAIN_ID;

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

  // Native TREX balance via wagmi's useBalance — routed through the configured InGen
  // transport, so it stays independent of the injected wallet's own RPC endpoint.
  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: isConnected && isIngen },
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title="InGen Confidential Token Quickstart"
        description="Connect your wallet to interact with ERC-7984 tokens on the InGen testnet."
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
  if (!isIngen) {
    return (
      <ActionScreen
        title="InGen Network Required"
        description={`This app only works on the InGen testnet (chain ID ${INGEN_CHAIN_ID}).`}
        actionLabel="Switch to InGen"
        pendingLabel="Switching…"
        pending={isSwitching}
        onAction={() => switchChain({ chainId: ingen.id })}
        error={switchError && "Could not switch to InGen. Please switch manually in your wallet."}
      />
    );
  }

  // ── Screen 3: Connected on InGen — main UI ─────────────────────────────────
  return (
    <main className="app-container">
      <AppHeader
        title="InGen Confidential Token Quickstart"
        address={address}
        balanceLabel="TREX"
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
