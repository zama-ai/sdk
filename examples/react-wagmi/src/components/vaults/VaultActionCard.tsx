"use client";

import { useState } from "react";
import {
  useConfidentialBalance,
  useGrantPermit,
  useHasPermit,
  useMetadata,
} from "@zama-fhe/react-sdk";
import { useDeposit, useOpenBatches, useRedeem } from "@zama-fhe/react-sdk/vaults";
import { matchZamaError, VaultJoinUnconfirmedError, type Address } from "@zama-fhe/sdk";
import type { BatchRef } from "@zama-fhe/sdk/vaults";
import { formatUnits } from "viem";
import { MintAndShieldButton } from "@/components/MintAndShieldButton";
import { describeError } from "@/lib/errors";
import { useNetwork } from "@/lib/hooks";
import { minAmount, parseAmount } from "@/lib/parseAmount";
import { addJoinedBatch, type Vault } from "@/lib/vaults";

const COPY = {
  deposit: {
    title: "Deposit",
    direction: "deposit",
    unit: "assets",
    receive: "shares",
    paused: "Deposits are paused",
  },
  redeem: {
    title: "Redeem",
    direction: "redeem",
    unit: "shares",
    receive: "assets",
    paused: "Redemptions are paused",
  },
} as const;

interface VaultActionCardProps {
  kind: keyof typeof COPY;
  vault: Vault;
  account: Address;
  permitContracts: Address[];
  /** The confidential token the action spends: the asset to deposit, the share to redeem. */
  token: Address;
}

/** One direction of the vault: its balance and its form. */
export function VaultActionCard({
  kind,
  vault,
  account,
  permitContracts,
  token,
}: VaultActionCardProps) {
  const { canMint } = useNetwork();
  const copy = COPY[kind];
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: metadata } = useMetadata(token);
  const { data: openBatches, error: pausedError } = useOpenBatches(vault, copy.direction);
  const paused = openBatches?.some((batch) => batch.paused);
  // The first decryption asks the wallet for a signature, so it starts from a click.
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const grantPermit = useGrantPermit();
  const balance = useConfidentialBalance(
    { address: token, account },
    { enabled: hasPermit === true },
  );

  // Stored so the batch can be read and claimed later, also after a reload. A single vault has a
  // single leg, so a join lands in a single batch.
  const callbacks = {
    onSuccess: ({ batches: [joined] }: { batches: readonly BatchRef[] }) => {
      if (joined) {
        addJoinedBatch(account, joined);
      }
      setAmount("");
    },
    // The join was mined, so a retry would send the amount twice.
    onError: (error: Error) => {
      if (error instanceof VaultJoinUnconfirmedError) setAmount("");
    },
  };
  const deposit = useDeposit(callbacks);
  const redeem = useRedeem(callbacks);
  const send = kind === "deposit" ? deposit : redeem;

  const parsed = metadata ? parseAmount(amount, metadata.decimals) : 0n;
  // Why the submit button is disabled, shown as its label; null when the form can be sent.
  const blockedReason = (): string | null => {
    if (paused === undefined) {
      if (!pausedError) return "Loading…";
      return (
        matchZamaError(pausedError, { VAULT_BATCHER_PAUSED: () => copy.paused }) ??
        "Could not read whether the batcher is paused"
      );
    }
    if (paused) return copy.paused;
    if (parsed === 0n) return "Enter an amount";
    if (!hasPermit) return "Decrypt your balances first";
    if (balance.data === undefined) return "Decrypting your balance…";
    if (parsed > balance.data) return "Amount is above your balance";
    return null;
  };
  const reason = blockedReason();

  const errors = [send.error, grantPermit.error, balance.error, pausedError].filter(
    (error) => error !== null,
  );

  return (
    <section className="card" aria-labelledby={`vault-${kind}-title`}>
      <h2 className="card-title" id={`vault-${kind}-title`}>
        {copy.title}
      </h2>
      <div className="balance-row">
        <div className="balance-label-group">
          <span className="balance-label">Available</span>
          {kind === "deposit" && canMint && metadata && (
            <MintAndShieldButton account={account} token={token} symbol={metadata.symbol} />
          )}
        </div>
        {!hasPermit ? (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={grantPermit.isPending}
            onClick={() => grantPermit.mutate(permitContracts)}
          >
            {grantPermit.isPending ? "Sign in your wallet…" : "Decrypt balances"}
          </button>
        ) : (
          <output className="balance-value">
            {balance.data === undefined || !metadata
              ? "Decrypting…"
              : `${formatUnits(balance.data, metadata.decimals)} ${metadata.symbol}`}
          </output>
        )}
      </div>

      <form
        className="card-status"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason === null) {
            setSubmitted(false);
            send.mutate({ vault, amount: parsed, onJoinSubmitted: () => setSubmitted(true) });
          }
        }}
      >
        <label className="sr-only" htmlFor={`vault-${kind}-amount`}>
          Amount to {kind}
        </label>
        <div className="input-row card-gap">
          <input
            id={`vault-${kind}-amount`}
            className="input"
            type="number"
            inputMode="decimal"
            min={metadata ? minAmount(metadata.decimals) : undefined}
            step="any"
            placeholder="0.00"
            value={amount}
            disabled={send.isPending}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="input-unit">{metadata?.symbol ?? copy.unit}</span>
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={send.isPending || reason !== null}
        >
          {send.isPending
            ? submitted
              ? "Waiting for the transaction…"
              : "Confirm in your wallet…"
            : (reason ?? copy.title)}
        </button>
      </form>

      {send.data && (
        <output className="alert alert-success card-status">
          Queued in batch #{send.data.batches[0]?.batchId.toString()}. You receive your{" "}
          {copy.receive} once the batch is processed and you claim them under In progress.
        </output>
      )}
      {errors.map((error, index) => (
        <div key={index} className="alert alert-error card-status" role="alert">
          {describeError(error, `${copy.title} failed`)}
        </div>
      ))}
    </section>
  );
}
