"use client";

import { useActionState, useState } from "react";
import { getAddress, encodeAbiParameters } from "viem";
import { useConfidentialTransferAndCall } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface VaultDepositCardProps {
  /** The confidential token bound to the vault (cUSDC). */
  tokenAddress: Address;
  /** The ConfidentialVault contract — the receiver of the `…AndCall`. */
  vaultAddress: Address;
  /** The connected wallet, used as the default beneficiary. */
  connectedAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  balanceDecryptRequired: boolean;
  onSuccess?: () => void;
}

// The SDK wraps transaction failures as `TransactionRevertedError` with the underlying
// viem/RPC error in `cause`. Surface that reason so reverts aren't hidden behind a generic message.
function depositErrorText(error: (Error & { cause?: unknown }) | null): string {
  if (!error) return "";
  const cause = error.cause as { shortMessage?: string; message?: string } | undefined;
  const causeMsg = cause?.shortMessage ?? cause?.message;
  const base = error.message || "Deposit failed";
  return causeMsg ? `${base} — ${causeMsg}` : base;
}

export function VaultDepositCard({
  tokenAddress,
  vaultAddress,
  connectedAddress,
  decimals,
  symbol,
  disabled,
  balanceDecryptRequired,
  onSuccess,
}: VaultDepositCardProps) {
  const [step, setStep] = useState<1 | 2>(1);

  const deposit = useConfidentialTransferAndCall({ address: tokenAddress }, { onSuccess });

  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  const [errorMessage, submitDeposit, isPending] = useActionState<string | null, FormData>(
    async (_prev, formData) => {
      const amount = parseAmount(formData.get("amount") as string, decimals);
      if (amount === 0n) return "Enter a valid amount.";
      const beneficiary = formData.get("beneficiary") as string;
      setStep(1);
      // The vault decodes `data` as the beneficiary address to credit. Encoding a real
      // domain message — not an opaque blob — is the whole point of the AndCall pattern:
      // value moves and the receiver reacts to it in a single atomic transaction.
      const data = encodeAbiParameters([{ type: "address" }], [getAddress(beneficiary)]);
      try {
        await deposit.mutateAsync({
          to: vaultAddress,
          amount,
          data,
          onEncryptComplete: () => setStep(2),
        });
        return null;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return depositErrorText(error);
      }
    },
    null,
  );

  return (
    <section className="card" aria-labelledby="vault-deposit-title">
      <h2 className="card-title" id="vault-deposit-title">
        Deposit into Vault — confidentialTransferAndCall
      </h2>
      <form action={submitDeposit}>
        <label className="sr-only" htmlFor="vault-amount">
          Deposit amount
        </label>
        <div className="input-row card-gap">
          <input
            id="vault-amount"
            name="amount"
            className="input"
            type="number"
            inputMode="decimal"
            min={minAmount(decimals)}
            step="any"
            required
            placeholder="0.00"
            data-testid="vault-amount-input"
          />
          <span className="input-unit">{symbol}</span>
        </div>
        <label className="token-meta" htmlFor="vault-beneficiary">
          Beneficiary (credited in the vault)
        </label>
        <input
          id="vault-beneficiary"
          name="beneficiary"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="Enter a valid address: 0x followed by 40 hexadecimal characters."
          defaultValue={connectedAddress}
          required
          placeholder="0x…"
          data-testid="vault-beneficiary-input"
        />
        <button
          type="submit"
          className="btn btn-primary btn-full"
          data-testid="vault-deposit-button"
          disabled={disabled || balanceDecryptRequired || isPending}
        >
          {isPending ? pendingLabel : "Deposit"}
        </button>
      </form>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable deposits.</p>
      )}
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {deposit.isSuccess && deposit.data?.txHash && (
        <output className="alert alert-success card-status">
          Deposited!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${deposit.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {deposit.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
