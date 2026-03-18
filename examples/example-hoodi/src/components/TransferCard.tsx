"use client";

import { useState } from "react";
import { isAddress } from "ethers";
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { parseAmount } from "@/lib/parseAmount";
import { HOODI_EXPLORER_URL } from "@/lib/config";

interface TransferCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
}

export function TransferCard({ tokenAddress, decimals, symbol, disabled }: TransferCardProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const transfer = useConfidentialTransfer({ tokenAddress });

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = step === 2 ? "Submitting…" : "Encrypting…";

  function handleTransfer() {
    setStep(1);
    transfer.mutate({
      to: recipient as Address,
      amount: parsedAmount,
      callbacks: { onEncryptComplete: () => setStep(2) },
    });
  }

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
      <button
        className="btn btn-primary btn-full"
        onClick={handleTransfer}
        disabled={disabled || parsedAmount === 0n || !isAddress(recipient) || transfer.isPending}
      >
        {transfer.isPending ? pendingLabel : "Transfer"}
      </button>
      {transfer.isError && (
        <div className="alert alert-error card-status">{transfer.error?.message}</div>
      )}
      {transfer.isSuccess && transfer.data?.txHash && (
        <div className="alert alert-success card-status">
          Transferred!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${transfer.data.txHash}`}
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
