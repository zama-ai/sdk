"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHasPermit, useMetadata } from "@zama-fhe/react-sdk";
import {
  useBatcherTokens,
  useBatchStatus,
  useClaim,
  useFinalize,
  useQuit,
  useVaultBatcher,
} from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { BatchState } from "@zama-fhe/sdk/vaults";
import { formatUnits } from "viem";
import { describeError } from "@/lib/errors";
import { removeOpenBatch, useOpenBatches } from "@/lib/openBatches";

// A keeper normally settles a dispatched batch. After this long, offer the user to settle it.
const FINALIZE_AFTER_SECONDS = 15 * 60;

interface BatchListProps {
  batcher: Address;
  account: Address;
  fromBlock: bigint;
}

/** The account's batches on one batcher that still need something from it or from the vault. */
export function BatchList({ batcher, account, fromBlock }: BatchListProps) {
  const { data: batchIds, error } = useOpenBatches(batcher, account, fromBlock);

  return (
    <div className="card-status">
      <h3 className="section-label">In progress</h3>
      {error ? (
        <div className="alert alert-error" role="alert">
          {describeError(error, "Could not read the batches")}
        </div>
      ) : !batchIds ? (
        <p className="token-meta">Loading…</p>
      ) : batchIds.length === 0 ? (
        <p className="token-meta">Nothing in progress.</p>
      ) : (
        <ul className="batch-list">
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
    </div>
  );
}

interface BatchRowProps {
  batcher: Address;
  account: Address;
  batchId: bigint;
}

function BatchRow({ batcher, account, batchId }: BatchRowProps) {
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
      <div>
        <span className="balance-label">
          Batch #{batchId.toString()}
          <JoinedAmount batcher={batcher} account={account} batchId={batchId} />
        </span>
        <p className="token-meta">{label}</p>
        {actionError && (
          <p className="token-meta token-meta-error">
            {describeError(actionError, "Transaction failed")}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy}
          onClick={action.run}
        >
          {busy ? "Sending…" : action.label}
        </button>
      )}
    </li>
  );

  if (!status) {
    return row(error ? describeError(error, "Could not read the batch") : "Loading…");
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

/**
 * The amount `account` put into the batch, decrypted and shown in the batcher's input token.
 * Waits for the permit the position card grants, so it never prompts the wallet on its own.
 */
function JoinedAmount({ batcher, account, batchId }: BatchRowProps) {
  const vaultBatcher = useVaultBatcher(batcher);
  const { data: hasPermit } = useHasPermit({ contractAddresses: [batcher] });
  const { data: tokens } = useBatcherTokens({ address: batcher });
  const { data: amount } = useQuery({
    // A bigint cannot go in a query key: TanStack hashes keys with JSON.stringify.
    queryKey: ["vault-joined-amount", batcher, account, batchId.toString()],
    queryFn: () => vaultBatcher.depositOf(batchId, account),
    // The amount joined into a batch does not change.
    staleTime: Infinity,
    enabled: hasPermit === true,
  });
  return amount === undefined || !tokens ? null : (
    <Amount token={tokens.fromToken} amount={amount} />
  );
}

function Amount({ token, amount }: { token: Address; amount: bigint }) {
  const { data: metadata } = useMetadata(token);
  return metadata ? ` · ${formatUnits(amount, metadata.decimals)} ${metadata.symbol}` : null;
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
