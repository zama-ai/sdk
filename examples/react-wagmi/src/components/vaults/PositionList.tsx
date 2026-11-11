"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDecryptValues, useHasPermit, useMetadata } from "@zama-fhe/react-sdk";
import { useBatch, useClaim, useFinalize, useQuit } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import type { BatchRef } from "@zama-fhe/sdk/vaults";
import { formatUnits } from "viem";
import { describeError } from "@/lib/errors";
import { batchKey } from "@/lib/vaults";

// A keeper normally settles a dispatched batch. After this long, offer the user to settle it.
const FINALIZE_AFTER_SECONDS = 15 * 60;

interface PositionListProps {
  account: Address;
  batches: BatchRef[];
  /** The confidential token the joins sent, to show their amounts. */
  token: Address;
  permitContracts: Address[];
  /** Called once a batch is claimed or taken back: it is no longer needed. */
  onDone: (batch: BatchRef) => void;
}

export function PositionList({
  account,
  batches,
  token,
  permitContracts,
  onDone,
}: PositionListProps) {
  return (
    <div className="card-status">
      <h3 className="section-label">In progress</h3>
      {batches.length === 0 ? (
        <p className="token-meta">Nothing in progress.</p>
      ) : (
        <ul className="batch-list">
          {batches.map((batch) => (
            <BatchRow
              key={batchKey(batch)}
              account={account}
              batchRef={batch}
              token={token}
              permitContracts={permitContracts}
              onDone={onDone}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface BatchRowProps extends Omit<PositionListProps, "batches"> {
  batchRef: BatchRef;
}

function BatchRow({ account, batchRef, token, permitContracts, onDone }: BatchRowProps) {
  const wallNow = useWallClock();
  const { data: batch, error, dataUpdatedAt } = useBatch(batchRef, { account });
  const done = { onSuccess: () => onDone(batchRef) };
  const claim = useClaim(done);
  const quit = useQuit(done);
  const finalize = useFinalize();
  const busy = claim.isPending || quit.isPending || finalize.isPending;
  const actionError = claim.error ?? quit.error ?? finalize.error;

  const row = (label: string, action?: { label: string; run: () => void }): ReactNode => (
    <li>
      <div>
        <span className="balance-label">
          Batch #{batchRef.batchId.toString()}
          {batch?.deposit && (
            <Amount
              token={token}
              batcher={batchRef.batcher}
              deposit={batch.deposit}
              permitContracts={permitContracts}
            />
          )}
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

  if (!batch) {
    return row(error ? describeError(error, "Could not read the batch") : "Loading…");
  }

  // Chain time now: the read's block time plus the wall time since the read, so a skewed browser
  // clock does not matter.
  const now = Number(batch.observedAt) + Math.max(0, wallNow - Math.floor(dataUpdatedAt / 1000));

  // `actions` lists what can be sent now, so a button only shows when it would go through.
  const offer = (action: "claim" | "quit", label: string) =>
    batch.actions.includes(action)
      ? { label, run: () => (action === "claim" ? claim : quit).mutate(batchRef) }
      : undefined;

  switch (batch.state) {
    case "pending": {
      const secondsLeft = Number(batch.dispatchableAt) - now;
      return row(
        secondsLeft > 0
          ? `Queued, sent in ${formatSeconds(secondsLeft)} at the earliest`
          : "Queued, waiting to be sent",
        offer("quit", "Cancel"),
      );
    }
    case "dispatched": {
      // Past the callback deadline, finalize cancels the batch instead of settling it.
      const expired = now >= Number(batch.cancelsAt);
      const late = now >= Number(batch.dispatchedAt) + FINALIZE_AFTER_SECONDS;
      if (!expired && !late) {
        return row("Processing");
      }
      return row(expired ? "Processing timed out" : "Processing is taking longer than usual", {
        label: expired ? "Cancel and get it back" : "Settle now",
        run: () => finalize.mutate(batchRef),
      });
    }
    case "finalized":
      return row("Ready to claim", offer("claim", "Claim"));
    case "canceled":
      return row("Did not go through, the amount is available", offer("quit", "Get it back"));
    default:
      return batch satisfies never;
  }
}

/** The account's deposit in the batch, decrypted under an existing permit: the row never prompts the wallet. */
function Amount({
  token,
  batcher,
  deposit,
  permitContracts,
}: {
  token: Address;
  batcher: Address;
  deposit: `0x${string}`;
  permitContracts: Address[];
}) {
  const { data: metadata } = useMetadata(token);
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const { data: values } = useDecryptValues(
    [{ encryptedValue: deposit, contractAddress: batcher }],
    { enabled: hasPermit === true },
  );
  const amount = values?.[deposit];
  return metadata && typeof amount === "bigint"
    ? ` · ${formatUnits(amount, metadata.decimals)} ${metadata.symbol}`
    : null;
}

/** The browser's Unix time in seconds, ticking every second to advance chain time between reads. */
function useWallClock() {
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
