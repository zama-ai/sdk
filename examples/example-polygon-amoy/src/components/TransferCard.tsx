"use client";

import { AMOY_EXPLORER_URL } from "@/lib/config";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { useConfidentialTransfer, useHasPermit } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { useActionState, useState } from "react";
import { getAddress } from "viem";

interface TransferCardProps {
  token: TokenWrapperPairWithMetadata;
  disabled: boolean;
  onSuccess?: () => void;
}

export function TransferCard({ token, disabled, onSuccess }: TransferCardProps) {
  const decimals = token.confidential.decimals;
  const symbol = token.confidential.symbol;

  const [step, setStep] = useState<1 | 2>(1);

  // A confidential transfer needs the sender's balance decrypted first — gate on the permit.
  const { data: isAllowed } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });
  const balanceDecryptRequired = !isAllowed;

  const transfer = useConfidentialTransfer(
    { address: token.confidentialTokenAddress },
    { onSuccess },
  );

  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  const [state, submitTransfer, isPending] = useActionState<
    { error: string } | { data: NonNullable<typeof transfer.data> } | null,
    FormData
  >(async (_, formData) => {
    const parsedAmount = parseAmount(formData.get("amount") as string, decimals);
    if (parsedAmount === 0n) return { error: "Enter a valid amount." };
    const recipient = formData.get("recipient") as string;
    setStep(1);
    try {
      const data = await transfer.mutateAsync({
        to: getAddress(recipient),
        amount: parseAmount(formData.get("amount") as string, decimals),
        onEncryptComplete: () => setStep(2),
      });
      return { data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error: error.message };
    }
  }, null);

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
          title="0x followed by 40 hexadecimal characters."
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
      {state && "error" in state && (
        <div className="alert alert-error card-status" role="alert">
          {state.error}
        </div>
      )}
      {state && "data" in state && state.data.txHash && (
        <output className="alert alert-success card-status">
          Transferred!{" "}
          <a href={`${AMOY_EXPLORER_URL}/tx/${state.data.txHash}`} target="_blank" rel="noreferrer">
            {state.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
