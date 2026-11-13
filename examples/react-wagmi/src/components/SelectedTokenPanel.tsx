"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useBalance, useConnection } from "wagmi";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import type { TokenView } from "@/components/PageChrome";
import { useNetwork } from "@/lib/hooks";
import { erc20BalanceKey } from "@/lib/queryKeys";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";

export function NoTokenPanel() {
  const { canMint } = useNetwork();
  return (
    <>
      {/* Static placeholder — BalancesCard is self-contained and needs a selected token,
          so with no token available we render the empty shell directly. */}
      <section className="card" aria-labelledby="balances-title">
        <h2 className="card-title" id="balances-title">
          Balances
        </h2>
        <div className="balance-row">
          <div className="balance-label-group">
            <span className="balance-label">ERC-20 (public)</span>
            {canMint && (
              <button type="button" className="btn btn-sm btn-secondary" disabled>
                Mint
              </button>
            )}
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
        <h3 className="card-title">Shield — ERC-20 → Confidential</h3>
        <button type="button" className="btn btn-primary" disabled>
          Shield
        </button>
      </section>

      <section className="card">
        <h3 className="card-title">Confidential Transfer</h3>
        <button type="button" className="btn btn-primary" disabled>
          Transfer
        </button>
      </section>

      <section className="card">
        <h3 className="card-title">Unshield — Confidential → ERC-20</h3>
        <button type="button" className="btn btn-primary" disabled>
          Unshield
        </button>
      </section>
    </>
  );
}

interface SelectedTokenPanelProps {
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
  view: TokenView;
}

export function SelectedTokenPanel({ token, validPairs, view }: SelectedTokenPanelProps) {
  const queryClient = useQueryClient();
  const { chain } = useNetwork();
  // Wallet state read straight from wagmi in place — nothing wallet-derived is passed in.
  const { address } = useConnection();
  // The native balance lives in the header, but its refetch is triggered here after an
  // action; useBalance shares wagmi's query cache by key, so the header's copy updates too.
  const { refetch: refetchNativeBalance } = useBalance({ address });

  // Narrow the address once (runtime guard, no cast) so the cards below get a definite
  // Address prop. The panel only renders on the connected screen, so this is a formality.
  if (!address) return null;

  // Invalidate the shared public ERC-20 balance key (read by the self-contained
  // BalancesCard) and refetch the native balance shown in the header.
  const refreshPublicBalances = () => {
    queryClient.invalidateQueries({
      queryKey: erc20BalanceKey(chain.id, token.tokenAddress, address),
    });
    void refetchNativeBalance();
  };

  if (view === "delegation") {
    return <DelegationOperations token={token} address={address} />;
  }

  return (
    <>
      <BalancesCard
        token={token}
        account={address}
        validPairs={validPairs}
        disabled={false}
        onSuccess={refreshPublicBalances}
      />

      {/* Pending unshield resume — checked for every registered token, not just the selected one.
          key includes address so the component remounts (re-checks IndexedDB) on wallet change. */}
      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          token={pair}
          onSuccess={refreshPublicBalances}
        />
      ))}

      <h2 className="section-label">Operations</h2>

      {/* key includes address and token so cards remount (inputs + state reset) on wallet or token change */}
      <ShieldCard
        key={`shield-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={false}
        onSuccess={refreshPublicBalances}
      />

      <TransferCard
        key={`transfer-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={false}
        onSuccess={refreshPublicBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={false}
        onSuccess={refreshPublicBalances}
      />
    </>
  );
}

function DelegationOperations({
  token,
  address,
}: {
  token: TokenWrapperPairWithMetadata;
  address: Address;
}) {
  return (
    <>
      {/* ── Delegation — token owner perspective ──────────────────────────────
          These cards are used by the wallet that OWNS the token.
          Grant or revoke another wallet's right to decrypt your balance. */}
      <h2 className="section-label">Delegation — as owner</h2>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={false}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${token.confidentialTokenAddress}`}
        token={token}
        disabled={false}
      />

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
      <h2 className="section-label">Delegation — as delegate</h2>

      <DecryptAsCard
        key={`decrypt-as-${address}-${token.confidentialTokenAddress}`}
        token={token}
        account={address}
        disabled={false}
      />
    </>
  );
}
