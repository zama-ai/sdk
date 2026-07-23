"use client";

import { useState, useActionState } from "react";
import { useUnshield, useHasPermit } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { INGEN_EXPLORER_URL } from "@/lib/config";

interface UnshieldCardProps {
  token: TokenWrapperPairWithMetadata;
  disabled: boolean;
  onSuccess?: () => void;
}

export function UnshieldCard({ token, disabled, onSuccess }: UnshieldCardProps) {
  const decimals = token.confidential.decimals;
  const symbol = token.confidential.symbol;

  const [step, setStep] = useState<1 | 2>(1);

  // Unshielding reads the confidential balance, so it needs a decryption permit first.
  const { data: isAllowed } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });
  const balanceDecryptRequired = !isAllowed;

  const unshield = useUnshield(token.confidentialTokenAddress, {
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const pendingLabel = step === 2 ? "Unshielding… (2/2)" : "Unshielding… (1/2)";

  const [state, submitUnshield, isPending] = useActionState<
    { error: string } | { data: NonNullable<typeof unshield.data> } | null,
    FormData
  >(async (_, formData) => {
    const parsedAmount = parseAmount(formData.get("amount") as string, decimals);
    if (parsedAmount === 0n) return { error: "Enter a valid amount." };
    setStep(1);
    try {
      const data = await unshield.mutateAsync({
        amount: parsedAmount,
        // onFinalizing fires between the two on-chain transactions, marking step 2.
        onFinalizing: () => setStep(2),
      });
      return { data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error: error.message };
    }
  }, null);

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
      {state && "error" in state && (
        <div className="alert alert-error card-status" role="alert">
          {state.error}
        </div>
      )}
      {state && "data" in state && state.data.txHash && (
        <output className="alert alert-success card-status">
          Unshielded!{" "}
          <a
            href={`${INGEN_EXPLORER_URL}/tx/${state.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {state.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
