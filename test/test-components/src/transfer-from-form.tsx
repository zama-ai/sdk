"use client";

import {
  useConfidentialTransferFrom,
  useConfidentialBalance,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

export function TransferFromForm({
  tokenAddress,
  defaultFrom,
  wrapperAddress,
}: {
  tokenAddress: Address;
  defaultFrom?: Address;
  wrapperAddress?: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress, account: address });
  const transferFrom = useConfidentialTransferFrom({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        transferFrom.mutate({
          from: formData.get("from") as Address,
          to: formData.get("to") as Address,
          amount: BigInt(formData.get("amount") as string),
        });
      }}
      className="space-y-4"
      data-testid="transfer-from-form"
    >
      <h2 className="text-xl font-semibold text-white">
        Transfer From {metadata?.symbol ?? "..."}
      </h2>

      {balance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="from"
        placeholder="From address (0x...)"
        defaultValue={defaultFrom ?? ""}
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="from-input"
      />

      <input
        type="text"
        name="to"
        placeholder="To address (0x...)"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="to-input"
      />

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={transferFrom.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="transfer-from-button"
      >
        {transferFrom.isPending ? "Transferring..." : "Transfer From"}
      </button>

      {transferFrom.isSuccess && (
        <p className="text-zama-success" data-testid="transfer-from-success">
          Transfer successful! Tx: {transferFrom.data?.txHash}
        </p>
      )}

      {transferFrom.isError && (
        <p className="text-zama-error" data-testid="transfer-from-error">
          Error: {transferFrom.error.message}
        </p>
      )}
    </form>
  );
}
