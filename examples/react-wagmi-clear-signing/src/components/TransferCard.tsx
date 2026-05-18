"use client";

import { useState } from "react";
import { isAddress } from "viem";
import {
  useConfidentialTransfer,
  useConfidentialTransferClearSigningIntent,
} from "@zama-fhe/react-sdk";
import type { Address, ClearSigningIntent } from "@zama-fhe/sdk";
import { parseAmount } from "@/lib/parseAmount";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";
import type { ClearSigningIntentSource } from "./ClearSigningConsole";

interface TransferCardProps {
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

export function TransferCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  balanceDecryptRequired,
  onSuccess,
  onIntent,
}: TransferCardProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const transfer = useConfidentialTransfer({ address: tokenAddress }, { onSuccess });
  const preview = useConfidentialTransferClearSigningIntent({ address: tokenAddress });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  function handleTransfer() {
    setStep(1);
    transfer.mutate({
      to: recipient as Address,
      amount: parsedAmount,
      onClearSigningIntent: (intent) => onIntent?.("runtime", "Confidential transfer", intent),
      onEncryptComplete: () => setStep(2),
    });
  }

  function handlePreview() {
    preview.mutate(
      { to: recipient as Address, amount: parsedAmount },
      {
        onSuccess: (intent) => onIntent?.("preview", "Confidential transfer", intent),
      },
    );
  }

  const actionDisabled =
    disabled || balanceDecryptRequired || parsedAmount === 0n || !isAddress(recipient);

  return (
    <div className="card">
      <div className="card-title">Confidential Transfer</div>
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
      <input
        className="input card-gap"
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="0x…"
      />
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
          onClick={handleTransfer}
          disabled={actionDisabled || transfer.isPending}
        >
          {transfer.isPending ? pendingLabel : "Transfer"}
        </button>
      </div>
      {balanceDecryptRequired && !disabled && (
        <p className="token-meta">Decrypt your balance first to enable transfers.</p>
      )}
      {preview.isError && (
        <div className="alert alert-error card-status">{preview.error?.message}</div>
      )}
      {transfer.isError && (
        <div className="alert alert-error card-status">{transfer.error?.message}</div>
      )}
      {transfer.isSuccess && transfer.data?.txHash && (
        <div className="alert alert-success card-status">
          Transferred!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${transfer.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {transfer.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
