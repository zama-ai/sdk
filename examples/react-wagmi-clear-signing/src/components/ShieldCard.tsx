"use client";

import { useState } from "react";
import { useShield, useShieldClearSigningIntent } from "@zama-fhe/react-sdk";
import type { Address, ClearSigningIntent } from "@zama-fhe/sdk";
import { parseAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";
import type { ClearSigningIntentSource } from "./ClearSigningConsole";

interface ShieldCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  publicBalance?: bigint;
  disabled: boolean;
  onSuccess?: () => void;
  onIntent?: (
    source: ClearSigningIntentSource,
    operation: string,
    intent: ClearSigningIntent,
  ) => void;
}

export function ShieldCard({
  tokenAddress,
  decimals,
  symbol,
  publicBalance,
  disabled,
  onSuccess,
  onIntent,
}: ShieldCardProps) {
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"prepare" | "approve" | "wrap">("prepare");

  // For ERC-7984 tokens, the wrapper IS the confidential token.
  const shield = useShield({ address: tokenAddress }, { onSuccess });
  const preview = useShieldClearSigningIntent({ address: tokenAddress });

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
      approvalAmount: publicBalance,
      // Let the SDK handle ERC-20 balance checks, allowance reads, USDT-style allowance reset,
      // approval transaction(s), shield submission, and cache invalidation.
      onClearSigningIntent: (intent) => onIntent?.("runtime", "Shield", intent),
      onApprovalSubmitted: () => setPhase("approve"),
      onShieldSubmitted: () => setPhase("wrap"),
    });
  }

  function handlePreview() {
    preview.mutate(
      { amount: parsedAmount, approvalAmount: publicBalance },
      {
        onSuccess: (intent) => onIntent?.("preview", "Shield", intent),
      },
    );
  }

  const actionDisabled =
    disabled || publicBalance === undefined || parsedAmount === 0n || parsedAmount > publicBalance;

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
      <div className="action-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handlePreview}
          disabled={actionDisabled || preview.isPending}
        >
          {preview.isPending ? "Previewing…" : "Preview intent"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleShield}
          disabled={actionDisabled || shield.isPending}
        >
          {shield.isPending ? pendingLabel : "Shield"}
        </button>
      </div>
      {preview.isError && (
        <div className="alert alert-error card-status">{preview.error?.message}</div>
      )}
      {publicBalance !== undefined && parsedAmount > publicBalance && (
        <div className="alert alert-error card-status">Insufficient public {symbol} balance.</div>
      )}
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
