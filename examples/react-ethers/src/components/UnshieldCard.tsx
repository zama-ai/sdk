"use client";

import { useState } from "react";
import { useUnshield, useZamaSDK, clearPendingUnshield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { parseAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";
import { setActiveUnshieldToken } from "@/lib/activeUnshield";

interface UnshieldCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  onSuccess?: () => void;
}

export function UnshieldCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  onSuccess,
}: UnshieldCardProps) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const { storage } = useZamaSDK();

  const unshield = useUnshield(
    // For ERC-7984 tokens, the wrapper IS the token — tokenAddress and wrapperAddress are the same.
    { tokenAddress, wrapperAddress: tokenAddress },
    {
      onSuccess: () => {
        clearPendingUnshield(storage, tokenAddress);
        onSuccess?.();
      },
      // Clear the active token ref on failure so a stale address is never used by the
      // onEvent handler in ZamaProvider if a subsequent UnshieldPhase1Submitted fires.
      onError: () => setActiveUnshieldToken(null),
    },
  );

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Unshielding… (2/2)" : "Unshielding… (1/2)";

  function handleUnshield() {
    setStep(1);
    // Register the active token before mutate() so the onEvent handler in ZamaProvider
    // can associate the txHash (from ZamaSDKEvents.UnshieldPhase1Submitted) with this wrapperAddress.
    // savePendingUnshield is called there — before Phase 1 is mined — so closing the tab
    // during mining still leaves recoverable state for PendingUnshieldCard.
    setActiveUnshieldToken(tokenAddress);
    unshield.mutate({
      amount: parsedAmount,
      callbacks: {
        // onFinalizing fires between the two on-chain transactions, marking step 2.
        onFinalizing: () => setStep(2),
      },
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
        disabled={disabled || parsedAmount === 0n || unshield.isPending}
      >
        {unshield.isPending ? pendingLabel : "Unshield"}
      </button>
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
