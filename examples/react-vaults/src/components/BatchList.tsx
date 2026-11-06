"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBatchStatus, useClaim, useFinalize, useQuit } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { BatchState } from "@zama-fhe/sdk/vaults";
import { FINALIZE_AFTER_SECONDS } from "@/lib/config";
import { removeOpenBatch, useOpenBatches } from "@/lib/open-batches";

interface BatchListProps {
  title: string;
  batcher: Address;
  account: Address;
}

export function BatchList({ title, batcher, account }: BatchListProps) {
  const { data: batchIds, error } = useOpenBatches(batcher, account);

  return (
    <section>
      <h2>{title}</h2>
      {error ? (
        <p className="error">{error.message}</p>
      ) : !batchIds ? (
        <p>Loading…</p>
      ) : batchIds.length === 0 ? (
        <p>Nothing in progress.</p>
      ) : (
        <ul>
          {batchIds.map((batchId) => (
            <BatchRow
              key={batchId.toString()}
              batcher={batcher}
              account={account}
              batchId={batchId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BatchRow({
  batcher,
  account,
  batchId,
}: Omit<BatchListProps, "title"> & { batchId: bigint }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const { data: status, error } = useBatchStatus(
    { address: batcher, batchId },
    { refetchInterval: 10_000 },
  );

  // A claim or quit leaves the batch state unchanged, so drop the row here.
  const done = () => removeOpenBatch(queryClient, batcher, account, batchId);
  const quit = useQuit({ address: batcher }, { onSuccess: done });
  const claim = useClaim({ address: batcher }, { onSuccess: done });
  const finalize = useFinalize({ address: batcher });
  const busy = quit.isPending || claim.isPending || finalize.isPending;
  const actionError = quit.error ?? claim.error ?? finalize.error;

  const row = (label: string, action?: { label: string; run: () => void }): ReactNode => (
    <li>
      <span>
        Batch #{batchId.toString()}: {label}
        {actionError && <span className="error"> {actionError.message}</span>}
      </span>
      {action && (
        <button disabled={busy} onClick={action.run}>
          {busy ? "Sending…" : action.label}
        </button>
      )}
    </li>
  );

  if (!status) {
    return row(error ? error.message : "Loading…");
  }

  switch (status.state) {
    case BatchState.Pending: {
      const secondsLeft = Number(status.dispatchableAt) - now;
      return row(
        secondsLeft > 0
          ? `Queued, sent in ${formatSeconds(secondsLeft)} at the earliest`
          : "Queued, waiting to be sent",
        { label: "Cancel", run: () => quit.mutate({ batchId }) },
      );
    }
    case BatchState.Dispatched: {
      // A keeper normally settles the batch: only offer finalize once it is late.
      if (now < Number(status.dispatchedAt) + FINALIZE_AFTER_SECONDS) {
        return row("Processing");
      }
      // Past the callback deadline, finalize cancels the batch instead of settling it.
      const expired = now >= Number(status.callbackDeadlineAt);
      return row(expired ? "Processing timed out" : "Processing is taking longer than usual", {
        label: expired ? "Cancel and get it back" : "Settle now",
        run: () => finalize.mutate({ batchId }),
      });
    }
    case BatchState.Finalized:
      return row("Ready to claim", { label: "Claim", run: () => claim.mutate({ batchId }) });
    case BatchState.Canceled:
      return row("Did not go through, the amount is available", {
        label: "Get it back",
        run: () => quit.mutate({ batchId }),
      });
    default:
      return status satisfies never;
  }
}

/** The current Unix time in seconds, updated every second, for local countdowns. */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
