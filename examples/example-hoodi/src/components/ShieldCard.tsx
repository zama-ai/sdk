"use client";

import { useState } from "react";
import { useShield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { parseAmount } from "@/lib/parseAmount";
import { HOODI_EXPLORER_URL } from "@/lib/config";

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
  const [step, setStep] = useState<1 | 2>(1);

  const shield = useShield({ tokenAddress, wrapperAddress: tokenAddress }, { onSuccess });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Shielding… (2/2)" : "Shielding… (1/2)";

  function handleShield() {
    setStep(1);
    shield.mutate({
      amount: parsedAmount,
      callbacks: { onApprovalSubmitted: () => setStep(2) },
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
        className="btn btn-primary btn-full"
        onClick={handleShield}
        disabled={disabled || parsedAmount === 0n || shield.isPending}
      >
        {shield.isPending ? pendingLabel : "Shield"}
      </button>
      {shield.isError && (
        <div className="alert alert-error card-status">
          {shield.error?.message?.toLowerCase().includes("allowance")
            ? "Approval transaction may still be confirming — please wait a moment and retry."
            : shield.error?.message}
        </div>
      )}
      {shield.isSuccess && shield.data?.txHash && (
        <div className="alert alert-success card-status">
          Shielded!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${shield.data.txHash}`}
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
