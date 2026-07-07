"use client";

import { useState } from "react";
import type { Address } from "@zama-fhe/sdk";
import { useUnshield } from "@zama-fhe/react-sdk";
import { parseAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

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
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const unshield = useUnshield(tokenAddress, {
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Unshielding… (2/2)" : "Unshielding… (1/2)";

  function handleUnshield() {
    setStep(1);
    unshield.mutate({
      amount: parsedAmount,
      // onFinalizing fires between the two on-chain transactions, marking step 2.
      onFinalizing: () => setStep(2),
    });
  }

  return (
    <div className="card">
      <div className="card-title">Unshield — Confidential → ERC-20</div>
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
        onClick={handleUnshield}
        disabled={disabled || balanceDecryptRequired || parsedAmount === 0n || unshield.isPending}
      >
        {unshield.isPending ? pendingLabel : "Unshield"}
      </button>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable unshielding.</p>
      )}
      {unshield.isError && (
        <div className="alert alert-error card-status">{unshield.error?.message}</div>
      )}
      {unshield.isSuccess && unshield.data?.txHash && (
        <div className="alert alert-success card-status">
          Unshielded!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${unshield.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {unshield.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
