"use client";

import { useState, useActionState } from "react";
import { getAddress } from "ethers";
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface TransferCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  balanceDecryptRequired: boolean;
  onSuccess?: () => void;
}

export function TransferCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  balanceDecryptRequired,
  onSuccess,
}: TransferCardProps) {
  const [step, setStep] = useState<1 | 2>(1);

  const transfer = useConfidentialTransfer({ address: tokenAddress }, { onSuccess });

  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  const [errorMessage, submitTransfer, isPending] = useActionState<string | null, FormData>(
    async (_, formData) => {
      const parsedAmount = parseAmount(formData.get("amount") as string, decimals);
      if (parsedAmount === 0n) return "Enter a valid amount.";
      const recipient = formData.get("recipient") as string;
      setStep(1);
      try {
        await transfer.mutateAsync({
          to: getAddress(recipient) as Address,
          amount: parseAmount(formData.get("amount") as string, decimals),
          onEncryptComplete: () => setStep(2),
        });
        return null;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return error.message;
      }
    },
    null,
  );

  return (
    <section className="card" aria-labelledby="confidential-transfer-title">
      <h2 className="card-title" id="confidential-transfer-title">
        Confidential Transfer
      </h2>
      <form action={submitTransfer}>
        <label className="sr-only" htmlFor="transfer-amount">
          Amount
        </label>
        <div className="input-row card-gap">
          <input
            id="transfer-amount"
            name="amount"
            className="input"
            type="number"
            inputMode="decimal"
            min={minAmount(decimals)}
            step="any"
            required
            placeholder="0.00"
          />
          <span className="input-unit">{symbol}</span>
        </div>
        <label className="sr-only" htmlFor="transfer-recipient">
          Recipient address
        </label>
        <input
          id="transfer-recipient"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="Enter a valid address: 0x followed by 40 hexadecimal characters."
          name="recipient"
          required
          placeholder="0x…"
        />
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={disabled || balanceDecryptRequired || isPending}
        >
          {isPending ? pendingLabel : "Transfer"}
        </button>
      </form>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable transfers.</p>
      )}
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {transfer.isSuccess && transfer.data?.txHash && (
        <output className="alert alert-success card-status">
          Transferred!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${transfer.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {transfer.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
