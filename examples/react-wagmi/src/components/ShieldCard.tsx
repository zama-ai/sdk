"use client";

import { useState } from "react";
import { useShield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount } from "@/lib/parseAmount";
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
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"prepare" | "approve" | "wrap">("prepare");

  const shield = useShield({ address: tokenAddress }, { onSuccess });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel =
    phase === "approve"
      ? "Shielding… (approving)"
      : phase === "wrap"
        ? "Shielding… (wrapping)"
        : "Shielding…";

  function handleShield() {
    setPhase("prepare");
    shield.mutate({
      amount: parsedAmount,
      // Let the SDK handle ERC-20 balance checks, allowance reads, USDT-style allowance reset,
      // approval transaction(s), shield submission, and cache invalidation.
      approvalStrategy: "exact",
      onApprovalSubmitted: () => setPhase("approve"),
      onShieldSubmitted: () => setPhase("wrap"),
    });
  }

  return (
    <div className="card">
      <div className="card-title">Shield — ERC-20 → Confidential</div>
      <div className="input-row card-gap">
        <input
          className="input"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <span className="input-unit">{symbol}</span>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleShield}
        disabled={disabled || parsedAmount === 0n || shield.isPending}
      >
        {shield.isPending ? pendingLabel : "Shield"}
      </button>
      {shield.isError && (
        <div className="alert alert-error card-status">{shield.error?.message}</div>
      )}
      {shield.isSuccess && shield.data?.txHash && (
        <div className="alert alert-success card-status">
          Shielded!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${shield.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shield.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
