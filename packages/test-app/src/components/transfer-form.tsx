"use client";

import { useState } from "react";
import {
  useConfidentialTransfer,
  useConfidentialBalance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function TransferForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance(tokenAddress);
  const transfer = useConfidentialTransfer({ tokenAddress, wrapperAddress });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    transfer.mutate({
      to: recipient as Address,
      amount: BigInt(amount),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="transfer-form">
      <h2 className="text-xl font-semibold">Transfer {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        placeholder="Recipient address (0x...)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="w-full px-3 py-2 border rounded"
        data-testid="recipient-input"
      />

      <input
        type="text"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 border rounded"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={transfer.isPending || !recipient || !amount}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="transfer-button"
      >
        {transfer.isPending ? "Transferring..." : "Transfer"}
      </button>

      {transfer.isSuccess && (
        <p className="text-green-600" data-testid="transfer-success">
          Transfer successful! Tx: {transfer.data}
        </p>
      )}

      {transfer.isError && (
        <p className="text-red-600" data-testid="transfer-error">
          Error: {transfer.error.message}
        </p>
      )}
    </form>
  );
}
