"use client";

import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { fetchIndexer, type BalanceResponse, type TransferEntry } from "@/lib/indexerClient";
import { CUSDC_ADDRESS, CUSDC_DECIMALS, CUSDC_SYMBOL, SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface HistoryCardProps {
  connectedAddress: Address;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Reads decrypted balance + transfer history straight from confidential-indexer's
 * REST API — no wagmi, no chain reads, no SDK. This data is only visible because
 * this specific account has delegated decrypt rights to this specific indexer
 * (see DelegationStatusBadge) — not a public view of anyone's balance.
 */
export function HistoryCard({ connectedAddress }: HistoryCardProps) {
  const balanceQuery = useQuery({
    queryKey: ["balance", connectedAddress],
    queryFn: () => fetchIndexer<BalanceResponse>(`/balances/${CUSDC_ADDRESS}/${connectedAddress}`),
    refetchInterval: 5000,
  });
  const transfersQuery = useQuery({
    queryKey: ["transfers", connectedAddress],
    queryFn: () =>
      fetchIndexer<{ transfers: TransferEntry[] }>(
        `/transfers/${CUSDC_ADDRESS}/${connectedAddress}`,
      ),
    refetchInterval: 5000,
  });

  const balanceStatus = balanceQuery.data?.status;

  return (
    <div className="card">
      <div className="card-title">Decrypted balance &amp; history (via confidential-indexer)</div>

      <div className="balance-row">
        <span className="balance-label">Balance</span>
        <span className={`balance-value ${balanceQuery.isLoading ? "loading" : ""}`}>
          {balanceStatus === 200 && balanceQuery.data
            ? `${formatUnits(BigInt(balanceQuery.data.body.clearValue), CUSDC_DECIMALS)} ${CUSDC_SYMBOL}`
            : balanceStatus === 202
              ? "decrypting…"
              : balanceStatus === 403
                ? "no delegation"
                : "—"}
        </span>
      </div>

      <div className="section-label">Transfers</div>
      {transfersQuery.data?.status === 200 && transfersQuery.data.body.transfers.length === 0 ? (
        <p className="history-empty">No transfers seen yet.</p>
      ) : transfersQuery.data?.status !== 200 ? (
        <p className="history-empty">
          {transfersQuery.data?.status === 403 ? "No delegation for this account." : "Loading…"}
        </p>
      ) : (
        [...transfersQuery.data.body.transfers].reverse().map((t) => (
          <div className="history-row" key={`${t.transactionHash}-${t.amountHandle}`}>
            <div className="history-row-main">
              <span className="history-amount">
                {formatUnits(BigInt(t.clearAmount), CUSDC_DECIMALS)} {CUSDC_SYMBOL}
              </span>
              <a
                href={`${SEPOLIA_EXPLORER_URL}/tx/${t.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                block {t.blockNumber}
              </a>
            </div>
            <div className="history-parties">
              {shortAddr(t.from)} → {shortAddr(t.to)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
