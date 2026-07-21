"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useBalance, useConnection } from "wagmi";
import { BalancesCard } from "@/components/BalancesCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { BSC_TESTNET_CHAIN_ID } from "@/lib/config";
import { erc20BalanceKey } from "@/lib/queryKeys";

interface SelectedTokenPanelProps {
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
}

export function SelectedTokenPanel({ token, validPairs }: SelectedTokenPanelProps) {
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

  const actionsDisabled = chainId !== BSC_TESTNET_CHAIN_ID;

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
