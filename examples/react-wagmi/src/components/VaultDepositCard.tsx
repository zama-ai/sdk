"use client";

import { useActionState, useState } from "react";
import { getAddress, encodeAbiParameters } from "viem";
import { useConfidentialTransferAndCall, useHasPermit } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { parseAmount, minAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface VaultDepositCardProps {
  /** The confidential token pair bound to the vault (cUSDC). */
  token: TokenWrapperPairWithMetadata;
  /** The connected wallet, used as the default beneficiary. */
  account: Address;
  /** The ConfidentialVault contract — the receiver of the `…AndCall`. */
  vaultAddress: Address;
  disabled: boolean;
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
  token,
  account,
  vaultAddress,
  disabled,
  onSuccess,
}: VaultDepositCardProps) {
  const decimals = token.confidential.decimals;
  const symbol = token.confidential.symbol;

  const [step, setStep] = useState<1 | 2>(1);

  // A deposit spends the caller's confidential balance, so it needs a decryption permit first.
  const { data: isAllowed } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });
  const balanceDecryptRequired = !isAllowed;

  const deposit = useConfidentialTransferAndCall(
    { address: token.confidentialTokenAddress },
    { onSuccess },
  );

  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  const [state, submitDeposit, isPending] = useActionState<
    { error: string } | { data: NonNullable<typeof deposit.data> } | null,
    FormData
  >(async (_prev, formData) => {
    const amount = parseAmount(formData.get("amount") as string, decimals);
    if (amount === 0n) return { error: "Enter a valid amount." };
    const beneficiary = formData.get("beneficiary") as string;
    setStep(1);
    // The vault decodes `data` as the beneficiary address to credit. Encoding a real
    // domain message — not an opaque blob — is the whole point of the AndCall pattern:
    // value moves and the receiver reacts to it in a single atomic transaction.
    const data = encodeAbiParameters([{ type: "address" }], [getAddress(beneficiary)]);
    try {
      const result = await deposit.mutateAsync({
        to: vaultAddress,
        amount,
        data,
        onEncryptComplete: () => setStep(2),
      });
      return { data: result };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error: depositErrorText(error) };
    }
  }, null);

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
          title="0x followed by 40 hexadecimal characters."
          defaultValue={account}
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
      {state && "error" in state && (
        <div className="alert alert-error card-status" role="alert">
          {state.error}
        </div>
      )}
      {state && "data" in state && state.data.txHash && (
        <output className="alert alert-success card-status">
          Deposited!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${state.data.txHash}`}
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
