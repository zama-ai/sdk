"use client";

import { useState, useActionState } from "react";
import { useUnshield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { INGEN_EXPLORER_URL } from "@/lib/config";

interface UnshieldCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  balanceDecryptRequired: boolean;
  onSuccess?: () => void;
}

export function UnshieldCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  balanceDecryptRequired,
  onSuccess,
}: UnshieldCardProps) {
  const [step, setStep] = useState<1 | 2>(1);

  const unshield = useUnshield(tokenAddress, {
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const pendingLabel = step === 2 ? "Unshielding… (2/2)" : "Unshielding… (1/2)";

  const [errorMessage, submitUnshield, isPending] = useActionState<string | null, FormData>(
    async (_, formData) => {
      const parsedAmount = parseAmount(formData.get("amount") as string, decimals);
      if (parsedAmount === 0n) return "Enter a valid amount.";
      setStep(1);
      try {
        await unshield.mutateAsync({
          amount: parsedAmount,
          // onFinalizing fires between the two on-chain transactions, marking step 2.
          onFinalizing: () => setStep(2),
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
    <section className="card" aria-labelledby="unshield-title">
      <h2 className="card-title" id="unshield-title">
        Unshield — Confidential → ERC-20
      </h2>
      <form action={submitUnshield}>
        <label className="sr-only" htmlFor="unshield-amount">
          Amount to unshield
        </label>
        <div className="input-row card-gap">
          <input
            id="unshield-amount"
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
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={disabled || balanceDecryptRequired || isPending}
        >
          {isPending ? pendingLabel : "Unshield"}
        </button>
      </form>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable unshielding.</p>
      )}
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {unshield.isSuccess && unshield.data?.txHash && (
        <output className="alert alert-success card-status">
          Unshielded!{" "}
          <a
            href={`${INGEN_EXPLORER_URL}/tx/${unshield.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {unshield.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
