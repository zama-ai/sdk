"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useConfidentialBalance,
  useGrantPermit,
  useHasPermit,
  useMetadata,
} from "@zama-fhe/react-sdk";
import { useDeposit, useRedeem, useVaultBatcher } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseUnits } from "viem";
import { ASSET_TOKEN, SHARE_TOKEN, VAULT } from "@/lib/config";
import { addOpenBatch } from "@/lib/open-batches";

// A deposit sends assets and is claimed as shares. A withdrawal (an ERC-4626 redeem) sends
// shares and is claimed as assets.
const MODES = {
  deposit: { label: "Deposit", token: ASSET_TOKEN, unit: "assets", batcher: VAULT.depositBatcher },
  withdraw: { label: "Withdraw", token: SHARE_TOKEN, unit: "shares", batcher: VAULT.redeemBatcher },
} as const;

export function VaultForm({ account }: { account: Address }) {
  const queryClient = useQueryClient();
  const [modeName, setModeName] = useState<keyof typeof MODES>("deposit");
  const mode = MODES[modeName];
  const [amount, setAmount] = useState("");

  const { data: metadata } = useMetadata(mode.token);
  const batcher = useVaultBatcher(mode.batcher);
  const { data: paused } = useQuery({
    queryKey: ["paused", mode.batcher],
    queryFn: () => batcher.paused(),
  });

  // The first decryption asks the wallet for a signature, so it starts from a click.
  // One permit covers both tokens, so switching mode does not ask again.
  const { data: hasPermit } = useHasPermit({ contractAddresses: [ASSET_TOKEN, SHARE_TOKEN] });
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
        {Object.entries(MODES).map(([name, { label }]) => (
          <button
            key={name}
            disabled={sending || name === modeName}
            onClick={() => setModeName(name as keyof typeof MODES)}
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
            onClick={() => grantPermit.mutate([ASSET_TOKEN, SHARE_TOKEN])}
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
            send.mutate({ amount: parsed });
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
          {sending ? "Confirm in your wallet, then wait…" : (reason ?? mode.label)}
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
