"use client";

import { useConfidentialTransferFromAndCall, useMetadata } from "@zama-fhe/react-sdk";
import type { Address, Hex } from "@zama-fhe/sdk";
import { getAddress } from "viem";

export function TransferFromAndCallForm({ tokenAddress }: { tokenAddress: Address }) {
  const { data: metadata } = useMetadata(tokenAddress);
  const transferFromAndCall = useConfidentialTransferFromAndCall(tokenAddress);

  return (
    <form
      action={(formData) => {
        transferFromAndCall.mutate({
          from: getAddress(formData.get("from") as string),
          to: getAddress(formData.get("to") as string),
          amount: BigInt(formData.get("amount") as string),
          data: formData.get("data") as Hex,
        });
      }}
      className="space-y-4"
      data-testid="transfer-from-and-call-form"
    >
      <h2 className="text-xl font-semibold text-white">
        Transfer From & Call {metadata?.symbol ?? "..."}
      </h2>

      <input
        type="text"
        name="from"
        placeholder="From address (0x...)"
        aria-label="From address"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="from-input"
      />

      <input
        type="text"
        name="to"
        placeholder="Recipient contract address (0x...)"
        aria-label="Recipient address"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="to-input"
      />

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        aria-label="Amount"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="amount-input"
      />

      <input
        type="text"
        name="data"
        placeholder="Receiver hook data (0x...)"
        aria-label="Receiver hook data"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="data-input"
      />

      <button
        type="submit"
        disabled={transferFromAndCall.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="transfer-from-and-call-button"
      >
        {transferFromAndCall.isPending ? "Transferring..." : "Transfer From & Call"}
      </button>

      {transferFromAndCall.isSuccess && (
        <p className="text-zama-success" data-testid="transfer-from-and-call-success">
          Transfer successful! Tx: {transferFromAndCall.data?.txHash}
        </p>
      )}

      {transferFromAndCall.isError && (
        <p className="text-zama-error" data-testid="transfer-from-and-call-error">
          Error: {transferFromAndCall.error.message}
        </p>
      )}
    </form>
  );
}
