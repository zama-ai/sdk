"use client";

import {
  useConfidentialTransfer,
  useConfidentialBalance,
  useMetadata,
  type Address,
} from "@zama-fhe/react-sdk";

export function TransferForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const transfer = useConfidentialTransfer({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        transfer.mutate({
          to: formData.get("recipient") as Address,
          amount: BigInt(formData.get("amount") as string),
          skipBalanceCheck: true,
        });
      }}
      className="space-y-4"
      data-testid="transfer-form"
    >
      <h2 className="text-xl font-semibold text-white">Transfer {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="recipient"
        placeholder="Recipient address (0x...)"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="recipient-input"
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
        disabled={transfer.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="transfer-button"
      >
        {transfer.isPending ? "Transferring..." : "Transfer"}
      </button>

      {transfer.isSuccess && (
        <p className="text-zama-success" data-testid="transfer-success">
          Transfer successful! Tx: {transfer.data?.txHash}
        </p>
      )}

      {transfer.isError && (
        <p className="text-zama-error" data-testid="transfer-error">
          Error: {transfer.error.message}
        </p>
      )}
    </form>
  );
}
