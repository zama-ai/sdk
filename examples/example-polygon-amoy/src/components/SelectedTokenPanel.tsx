"use client";

import { BalancesCard } from "@/components/BalancesCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { AMOY_CHAIN_ID } from "@/lib/config";
import { erc20BalanceKey } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query"; // query key builders for SDK-managed caches — /query subpath export
import { useBalance, useConnection } from "wagmi";

interface SelectedTokenPanelProps {
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
}

// Rendered only once a token pair is selected, so `token` is always defined here —
// no zero-address placeholders or optional chaining needed. Owns the shared
// refreshBalances invalidation that every operation card calls on success.
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
    // Invalidate the encrypted handle so useConfidentialBalance re-polls after
    // any operation that changes the confidential balance (shield, unshield, transfer).
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialBalance.token(token.confidentialTokenAddress),
    });
  };

  const actionsDisabled = chainId !== AMOY_CHAIN_ID;

  return (
    <>
      <BalancesCard
        token={token}
        account={address}
        validPairs={validPairs}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      {/* Pending unshield resume — checked for every registered token, not just the selected one.
          key includes address so the component remounts (re-checks IndexedDB) on wallet change. */}
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

      {/* ── Delegation — token owner perspective ──────────────────────────────
          These cards are used by the wallet that OWNS the token.
          Grant or revoke another wallet's right to decrypt your balance. */}
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

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
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

// Static placeholder shown when the registry resolves with no token pairs. The
// self-contained cards require a selected token, so instead of mounting them we render
// an inert, disabled shell that mirrors the connected layout — the action buttons exist
// but stay disabled until a token is available.
export function NoTokenWorkspace() {
  return (
    <>
      <section className="card" aria-labelledby="balances-title">
        <h2 className="card-title" id="balances-title">
          Balances
        </h2>
        <div className="balance-row">
          <div className="balance-label-group">
            <span className="balance-label">ERC-20 (public)</span>
            <button type="button" className="btn btn-sm btn-secondary" disabled>
              Mint
            </button>
          </div>
          <output className="balance-value">—</output>
        </div>
        <div className="balance-row">
          <span className="balance-label">Confidential (private)</span>
          <button type="button" className="btn btn-sm btn-secondary" disabled>
            Decrypt Balance
          </button>
        </div>
      </section>

      <h2 className="section-label">Operations</h2>

      <section className="card">
        <h2 className="card-title">Shield — ERC-20 → Confidential</h2>
        <button type="button" className="btn btn-primary btn-full" disabled>
          Shield
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Confidential Transfer</h2>
        <button type="button" className="btn btn-primary btn-full" disabled>
          Transfer
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Unshield — Confidential → ERC-20</h2>
        <button type="button" className="btn btn-primary btn-full" disabled>
          Unshield
        </button>
      </section>
    </>
  );
}
