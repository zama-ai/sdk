"use client";

import { formatUnits } from "viem";
import type { ActivityItem } from "@zama-fhe/sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface ActivityFeedCardProps {
  activity: ActivityItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  decimals: number;
  symbol: string;
}

function formatType(item: ActivityItem): string {
  switch (item.type) {
    case "transfer":
      return item.direction === "incoming"
        ? "Received"
        : item.direction === "self"
          ? "Self Transfer"
          : "Sent";
    case "shield":
      return "Shield";
    case "unshield_requested":
      return "Unshield Requested";
    case "unshield_started":
      return "Unshield Started";
    case "unshield_finalized":
      return "Unshield Finalized";
  }
}

function formatAmount(item: ActivityItem, decimals: number, symbol: string): string {
  if (item.amount.type === "clear") {
    return `${formatUnits(item.amount.value, decimals)} ${symbol}`;
  }
  if (item.amount.decryptedValue !== undefined) {
    return `${formatUnits(item.amount.decryptedValue, decimals)} ${symbol}`;
  }
  return "Encrypted";
}

function directionIndicator(item: ActivityItem): string {
  switch (item.direction) {
    case "incoming":
      return "+";
    case "outgoing":
      return "-";
    case "self":
      return "~";
  }
}

export function ActivityFeedCard({
  activity,
  isLoading,
  isError,
  decimals,
  symbol,
}: ActivityFeedCardProps) {
  return (
    <div className="card">
      <div className="card-title">Activity Feed</div>
      {isLoading && <p className="activity-empty">Loading activity…</p>}
      {isError && <p className="activity-empty activity-error">Failed to load activity.</p>}
      {!isLoading && !isError && (!activity || activity.length === 0) && (
        <p className="activity-empty">No activity yet.</p>
      )}
      {activity?.map((item, i) => (
        <div
          key={`${item.metadata.transactionHash ?? ""}-${item.metadata.logIndex ?? i}`}
          className="activity-row"
        >
          <div className="activity-left">
            <span className={`activity-direction activity-direction-${item.direction}`}>
              {directionIndicator(item)}
            </span>
            <span className="activity-type">{formatType(item)}</span>
          </div>
          <div className="activity-right">
            <span className="activity-amount">{formatAmount(item, decimals, symbol)}</span>
            {item.metadata.transactionHash && (
              <a
                className="activity-tx"
                href={`${SEPOLIA_EXPLORER_URL}/tx/${item.metadata.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {item.metadata.transactionHash.slice(0, 10)}…
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
