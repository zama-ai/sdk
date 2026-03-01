"use client";

import { useEffect, useState } from "react";
import {
  useActivityFeed,
  useTokenMetadata,
  TOKEN_TOPICS,
  type Address,
  type ActivityItem,
} from "@zama-fhe/react-sdk";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";

function formatAmount(item: ActivityItem, decimals: number): string {
  if (item.amount.type === "clear") {
    return formatUnits(item.amount.value, decimals);
  }
  if (item.amount.decryptedValue !== undefined) {
    return formatUnits(item.amount.decryptedValue, decimals);
  }
  return "encrypted";
}

export function ActivityFeedPanel({ tokenAddress }: { tokenAddress: Address }) {
  const { address: userAddress } = useAccount();
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const publicClient = usePublicClient();
  const [logs, setLogs] = useState<
    | {
        topics: string[];
        data: string;
        transactionHash: string;
        blockNumber: bigint;
        logIndex: number;
      }[]
    | undefined
  >(undefined);

  useEffect(() => {
    if (!publicClient || !tokenAddress) return;
    publicClient
      .request({
        method: "eth_getLogs",
        params: [
          {
            address: tokenAddress as `0x${string}`,
            topics: [[...TOKEN_TOPICS] as `0x${string}`[]],
            fromBlock: "0x0",
            toBlock: "latest",
          },
        ],
      })
      .then((rawLogs) => {
        setLogs(
          rawLogs.map((log) => ({
            topics: log.topics as string[],
            data: log.data,
            transactionHash: log.transactionHash!,
            blockNumber: BigInt(log.blockNumber!),
            logIndex: Number(log.logIndex!),
          })),
        );
      });
  }, [publicClient, tokenAddress]);

  const { data: activity, isLoading } = useActivityFeed({
    tokenAddress,
    userAddress,
    logs,
    decrypt: true,
  });

  const decimals = metadata?.decimals ?? 6;

  return (
    <div className="space-y-4" data-testid="activity-feed-panel">
      <h2 className="text-xl font-semibold">Activity Feed — {metadata?.symbol ?? "..."}</h2>

      {isLoading && <p>Loading activity...</p>}

      {activity && (
        <>
          <p>
            <span data-testid="activity-count">{activity.length}</span> event
            {activity.length !== 1 ? "s" : ""}
          </p>

          <div className="space-y-2">
            {activity.map((item, index) => (
              <div
                key={`${item.metadata.transactionHash}-${item.metadata.logIndex}`}
                className="p-3 border border-gray-200 rounded bg-white shadow-sm"
                data-testid={`activity-item-${index}`}
              >
                <span data-testid={`activity-type-${index}`}>{item.type}</span>
                {" | "}
                <span data-testid={`activity-direction-${index}`}>{item.direction}</span>
                {" | "}
                <span data-testid={`activity-amount-${index}`}>{formatAmount(item, decimals)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
