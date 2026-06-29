"use client";

import { useState } from "react";
import { encodeAbiParameters, isAddress } from "viem";
import { useConfidentialTransferAndCall } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { parseAmount } from "@/lib/parseAmount";
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
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState<string>(connectedAddress);
  const [step, setStep] = useState<1 | 2>(1);

  const deposit = useConfidentialTransferAndCall({ address: tokenAddress }, { onSuccess });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  function handleDeposit() {
    setStep(1);
    // The vault decodes `data` as the beneficiary address to credit. Encoding a real
    // domain message — not an opaque blob — is the whole point of the AndCall pattern:
    // value moves and the receiver reacts to it in a single atomic transaction.
    const data = encodeAbiParameters([{ type: "address" }], [beneficiary as Address]);
    deposit.mutate({
      to: vaultAddress,
      amount: parsedAmount,
      data,
      onEncryptComplete: () => setStep(2),
    });
  }

  return (
    <div className="card">
      <div className="card-title">Deposit into Vault — confidentialTransferAndCall</div>
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
      <label className="token-meta">Beneficiary (credited in the vault)</label>
      <input
        className="input card-gap"
        type="text"
        value={beneficiary}
        onChange={(e) => setBeneficiary(e.target.value)}
        placeholder="0x…"
      />
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleDeposit}
        disabled={
          disabled ||
          balanceDecryptRequired ||
          parsedAmount === 0n ||
          !isAddress(beneficiary) ||
          deposit.isPending
        }
      >
        {deposit.isPending ? pendingLabel : "Deposit"}
      </button>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable deposits.</p>
      )}
      {deposit.isError && (
        <div className="alert alert-error card-status">{deposit.error?.message}</div>
      )}
      {deposit.isSuccess && deposit.data?.txHash && (
        <div className="alert alert-success card-status">
          Deposited!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${deposit.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {deposit.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
