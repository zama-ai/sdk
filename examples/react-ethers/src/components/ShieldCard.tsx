"use client";

import { useState, useActionState } from "react";
import { useShield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface ShieldCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  onSuccess?: () => void;
}

export function ShieldCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  onSuccess,
}: ShieldCardProps) {
  const [phase, setPhase] = useState<"shield" | "approve" | "submit">("shield");

  const pendingLabel =
    phase === "approve"
      ? "Shielding… (approval)"
      : phase === "submit"
        ? "Shielding… (submitting)"
        : "Shielding…";

  const shield = useShield({ address: tokenAddress }, { onSuccess });

  const [errorMessage, submitShield, isPending] = useActionState<string | null, FormData>(
    async (_, formData) => {
      const parsedAmount = parseAmount(formData.get("amount") as string, decimals);
      if (parsedAmount === 0n) return "Enter a valid amount.";
      setPhase("shield");
      try {
        await shield.mutateAsync({
          amount: parsedAmount,
          approvalStrategy: "exact",
          onApprovalSubmitted: () => setPhase("approve"),
          onShieldSubmitted: () => setPhase("submit"),
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
    <section className="card" aria-labelledby="shield-title">
      <h2 className="card-title" id="shield-title">
        Shield — ERC-20 → Confidential
      </h2>
      <form action={submitShield}>
        <label className="sr-only" htmlFor="shield-amount">
          Amount to shield
        </label>
        <div className="input-row card-gap">
          <input
            id="shield-amount"
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
        <button type="submit" className="btn btn-primary btn-full" disabled={disabled || isPending}>
          {isPending ? pendingLabel : "Shield"}
        </button>
      </form>
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {shield.isSuccess && shield.data?.txHash && (
        <output className="alert alert-success card-status">
          Shielded!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${shield.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shield.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
