"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useHasPermit, useMetadata } from "@zama-fhe/react-sdk";
import { useExit, useFinalize, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits } from "viem";
import { describeError } from "@/lib/errors";
import { recordKey, type JoinRecord, type Vaults } from "@/lib/vaults";

// A keeper normally settles a dispatched batch. After this long, offer the user to settle it.
const FINALIZE_AFTER_SECONDS = 15 * 60;

interface PositionListProps {
  vaults: Vaults;
  records: JoinRecord[];
  /** The confidential token the joins sent, to show their amounts. */
  token: Address;
  permitContracts: Address[];
  /** Called once a position is exited: its record is no longer needed. */
  onExited: (record: JoinRecord) => void;
}

/** The account's positions in one direction of the vault, one per stored join record. */
export function PositionList({
  vaults,
  records,
  token,
  permitContracts,
  onExited,
}: PositionListProps) {
  return (
    <div className="card-status">
      <h3 className="section-label">In progress</h3>
      {records.length === 0 ? (
        <p className="token-meta">Nothing in progress.</p>
      ) : (
        <ul className="batch-list">
          {records.map((record) => (
            <PositionRow
              key={recordKey(record)}
              vaults={vaults}
              record={record}
              token={token}
              permitContracts={permitContracts}
              onExited={onExited}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface PositionRowProps extends Omit<PositionListProps, "records"> {
  record: JoinRecord;
}

function PositionRow({ vaults, record, token, permitContracts, onExited }: PositionRowProps) {
  const now = useNow();
  // Decrypts the amount only under an existing permit: the row never prompts the wallet.
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const { data: position, error } = usePosition(vaults, record, { decrypt: hasPermit === true });
  const exit = useExit(vaults, { onSuccess: () => onExited(record) });
  const finalize = useFinalize(vaults);
  const busy = exit.isPending || finalize.isPending;
  const actionError = exit.error ?? finalize.error;

  // The SDK does not say when a batch was dispatched: count from when this page first saw it.
  const [settlingSince, setSettlingSince] = useState<number>();
  useEffect(() => {
    if (position?.phase === "settling" && settlingSince === undefined) {
      setSettlingSince(Math.floor(Date.now() / 1000));
    }
  }, [position?.phase, settlingSince]);

  // The vaults config has a single vault, so every join has a single leg.
  const leg = position?.legs[0];

  const row = (label: string, action?: { label: string; run: () => void }): ReactNode => (
    <li>
      <div>
        <span className="balance-label">
          Batch #{record.legs[0]?.batchId.toString()}
          {typeof leg?.amount === "bigint" && <Amount token={token} amount={leg.amount} />}
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

  if (!position || !leg) {
    return row(error ? describeError(error, "Could not read the position") : "Loading…");
  }

  const exitAction = (label: string) =>
    position.availableActions.includes("exit")
      ? { label, run: () => exit.mutate(record) }
      : undefined;

  switch (position.phase) {
    case "queued": {
      const secondsLeft = position.nextChangeAt === null ? 0 : Number(position.nextChangeAt) - now;
      return row(
        secondsLeft > 0
          ? `Queued, sent in ${formatSeconds(secondsLeft)} at the earliest`
          : "Queued, waiting to be sent",
        exitAction("Cancel"),
      );
    }
    case "settling": {
      // Past the callback deadline, finalize cancels the batch instead of settling it.
      const expired = leg.state === "dispatched" && now >= Number(leg.cancelsAt);
      const late = settlingSince !== undefined && now >= settlingSince + FINALIZE_AFTER_SECONDS;
      if (!expired && !late) {
        return row("Processing");
      }
      return row(expired ? "Processing timed out" : "Processing is taking longer than usual", {
        label: expired ? "Cancel and get it back" : "Settle now",
        run: () => finalize.mutate(record),
      });
    }
    case "ready":
      // An exit pays out a settled batch and refunds a canceled one.
      return leg.state === "finalized"
        ? row("Ready to claim", exitAction("Claim"))
        : row("Did not go through, the amount is available", exitAction("Get it back"));
    case "closed":
      return row("Done", { label: "Remove", run: () => onExited(record) });
    default:
      return position.phase satisfies never;
  }
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
