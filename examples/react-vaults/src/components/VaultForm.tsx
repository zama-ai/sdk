"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConfidentialBalance,
  useGrantPermit,
  useHasPermit,
  useMetadata,
} from "@zama-fhe/react-sdk";
import { useBatcherTokens, useDeposit, usePaused, useRedeem } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseUnits } from "viem";
import { VAULT } from "@/lib/config";
import { addOpenBatch } from "@/lib/open-batches";

export function VaultForm({ account }: { account: Address }) {
  // The deposit batcher takes the vault's asset and pays out its shares.
  const { data: tokens, error } = useBatcherTokens({ address: VAULT.depositBatcher });
  if (!tokens) {
    return <section>{error ? <p className="error">{error.message}</p> : "Loading…"}</section>;
  }
  return <Form account={account} assetToken={tokens.fromToken} shareToken={tokens.toToken} />;
}

interface FormProps {
  account: Address;
  assetToken: Address;
  shareToken: Address;
}

function Form({ account, assetToken, shareToken }: FormProps) {
  const queryClient = useQueryClient();
  // A deposit sends assets and is claimed as shares. A withdrawal (an ERC-4626 redeem) sends
  // shares and is claimed as assets.
  const modes = {
    deposit: { label: "Deposit", token: assetToken, unit: "assets", batcher: VAULT.depositBatcher },
    withdraw: {
      label: "Withdraw",
      token: shareToken,
      unit: "shares",
      batcher: VAULT.redeemBatcher,
    },
  };
  const [modeName, setModeName] = useState<keyof typeof modes>("deposit");
  const mode = modes[modeName];
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: metadata } = useMetadata(mode.token);
  const { data: paused } = usePaused({ address: mode.batcher });

  // The first decryption asks the wallet for a signature, so it starts from a click.
  // One permit covers both tokens, so switching mode does not ask again.
  const { data: hasPermit } = useHasPermit({ contractAddresses: [assetToken, shareToken] });
  const grantPermit = useGrantPermit();
  const balance = useConfidentialBalance(
    { address: mode.token, account },
    { enabled: hasPermit === true },
  );

  // Store the returned batch id: the batch list shows it right away.
  const deposit = useDeposit(
    { addresses: VAULT },
    {
      onSuccess: ({ batchId }) => {
        addOpenBatch(queryClient, VAULT.depositBatcher, account, batchId);
        setAmount("");
      },
    },
  );
  const redeem = useRedeem(
    { addresses: VAULT },
    {
      onSuccess: ({ batchId }) => {
        addOpenBatch(queryClient, VAULT.redeemBatcher, account, batchId);
        setAmount("");
      },
    },
  );
  const send = modeName === "deposit" ? deposit : redeem;
  const sending = deposit.isPending || redeem.isPending;

  const parsed = parseAmount(amount, metadata?.decimals);
  const reason =
    paused === undefined
      ? "Loading…"
      : paused
        ? `${mode.label}s are paused`
        : !parsed
          ? "Enter an amount"
          : balance.data === undefined
            ? "Decrypt your balance first"
            : parsed > balance.data
              ? "Amount is above your balance"
              : null;

  return (
    <section>
      <div>
        {Object.entries(modes).map(([name, { label }]) => (
          <button
            key={name}
            disabled={sending || name === modeName}
            onClick={() => setModeName(name as keyof typeof modes)}
          >
            {label}
          </button>
        ))}
      </div>

      <p>
        Balance:{" "}
        {!hasPermit ? (
          <button
            disabled={grantPermit.isPending}
            onClick={() => grantPermit.mutate([assetToken, shareToken])}
          >
            {grantPermit.isPending ? "Sign in your wallet…" : "Decrypt"}
          </button>
        ) : balance.data === undefined || !metadata ? (
          "Decrypting…"
        ) : (
          `${formatUnits(balance.data, metadata.decimals)} ${metadata.symbol}`
        )}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed) {
            setSubmitted(false);
            send.mutate({ amount: parsed, onJoinSubmitted: () => setSubmitted(true) });
          }
        }}
      >
        <label>
          Amount ({mode.unit}){" "}
          <input
            inputMode="decimal"
            value={amount}
            disabled={sending}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>{" "}
        <button type="submit" disabled={sending || reason !== null}>
          {sending
            ? submitted
              ? "Waiting for the transaction…"
              : "Confirm in your wallet…"
            : (reason ?? mode.label)}
        </button>
      </form>

      {send.data && (
        <p>
          Queued in batch #{send.data.batchId.toString()}. You receive your{" "}
          {modeName === "deposit" ? "shares" : "assets"} once the batch is processed and you claim
          them below.
        </p>
      )}
      {[send.error, grantPermit.error, balance.error].map(
        (error) =>
          error && (
            <p key={error.message} className="error">
              {error.message}
            </p>
          ),
      )}
    </section>
  );
}

function parseAmount(value: string, decimals: number | undefined): bigint | undefined {
  if (!value || decimals === undefined) {
    return undefined;
  }
  try {
    const parsed = parseUnits(value, decimals);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}
