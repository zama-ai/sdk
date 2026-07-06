"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchIndexer, type DelegationEntry } from "@/lib/indexerClient";
import { CUSDC_ADDRESS } from "@/lib/config";

interface DelegationStatusBadgeProps {
  connectedAddress: Address;
}

/**
 * Explains *why* HistoryCard can (or can't) show anything: confidential-indexer
 * only ever reveals what its own delegate identity has actually been granted —
 * never a public view. See confidential-indexer/WALKTHROUGH.md ("not a public
 * block explorer").
 */
export function DelegationStatusBadge({ connectedAddress }: DelegationStatusBadgeProps) {
  const query = useQuery({
    queryKey: ["delegations"],
    queryFn: () => fetchIndexer<{ delegations: DelegationEntry[] }>("/delegations"),
    refetchInterval: 5000,
  });

  if (query.isLoading) {
    return <p className="delegation-status delegation-status-checking">Checking delegation…</p>;
  }

  const active = query.data?.body.delegations.some(
    (d) =>
      d.delegator.toLowerCase() === connectedAddress.toLowerCase() &&
      d.contractAddress.toLowerCase() === CUSDC_ADDRESS.toLowerCase(),
  );

  return active ? (
    <p className="delegation-status delegation-status-active">
      ✓ Delegated to the indexer — it can decrypt this account's cUSDC activity
    </p>
  ) : (
    <p className="delegation-status delegation-status-none">
      ✗ Not delegated — the indexer can't see anything for this account (see README.md)
    </p>
  );
}
