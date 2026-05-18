"use client";

import { useState } from "react";
import { useUnshield, useUnwrapClearSigningIntent, useZamaSDK } from "@zama-fhe/react-sdk";
import { clearPendingUnshield, type Address, type ClearSigningIntent } from "@zama-fhe/sdk";
import { parseAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";
import { setActiveUnshieldToken } from "@/lib/activeUnshield";
import type { ClearSigningIntentSource } from "./ClearSigningConsole";

interface UnshieldCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  balanceDecryptRequired: boolean;
  onSuccess?: () => void;
  onIntent?: (
    source: ClearSigningIntentSource,
    operation: string,
    intent: ClearSigningIntent,
  ) => void;
}

export function UnshieldCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  balanceDecryptRequired,
  onSuccess,
  onIntent,
}: UnshieldCardProps) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const { storage } = useZamaSDK();

  // For ERC-7984 tokens, the wrapper IS the confidential token.
  const unshield = useUnshield(tokenAddress, {
    onSuccess: () => {
      clearPendingUnshield(storage, tokenAddress).catch((err) =>
        console.error("[UnshieldCard] Failed to clear pending unshield:", err),
      );
      onSuccess?.();
    },
    // Clear the active token ref on failure so a stale address is never used by the
    // onEvent handler in ZamaProvider if a subsequent UnshieldPhase1Submitted fires.
    onError: () => setActiveUnshieldToken(null),
  });
  const preview = useUnwrapClearSigningIntent({ address: tokenAddress });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Unshielding… (2/2)" : "Unshielding… (1/2)";

  function handleUnshield() {
    setStep(1);
    // Register the active token before mutate() so the onEvent handler in ZamaProvider
    // can associate the txHash (from ZamaSDKEvents.UnshieldPhase1Submitted) with this wrapperAddress.
    // savePendingUnshield is called there — after Phase 1 is mined but before Phase 2
    // completes — so closing the tab between phases still leaves recoverable state.
    setActiveUnshieldToken(tokenAddress);
    unshield.mutate({
      amount: parsedAmount,
      onClearSigningIntent: (intent) => onIntent?.("runtime", "Unshield", intent),
      // onFinalizing fires between the two on-chain transactions, marking step 2.
      onFinalizing: () => setStep(2),
    });
  }

  function handlePreview() {
    preview.mutate(
      { amount: parsedAmount },
      {
        onSuccess: (intent) => onIntent?.("preview", "Unshield", intent),
      },
    );
  }

  const actionDisabled = disabled || balanceDecryptRequired || parsedAmount === 0n;

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
          onClick={handleUnshield}
          disabled={actionDisabled || unshield.isPending}
        >
          {unshield.isPending ? pendingLabel : "Unshield"}
        </button>
      </div>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable unshielding.</p>
      )}
      {preview.isError && (
        <div className="alert alert-error card-status">{preview.error?.message}</div>
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
