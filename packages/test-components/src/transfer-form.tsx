"use client";

import {
  useConfidentialTransfer,
  useConfidentialBalance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/react-sdk";

export function TransferForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const transfer = useConfidentialTransfer({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        transfer.mutate({
          to: formData.get("recipient") as Address,
          amount: BigInt(formData.get("amount") as string),
        });
      }}
      className="space-y-4"
      data-testid="transfer-form"
    >
      <h2 className="text-xl font-semibold">Transfer {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="recipient"
        placeholder="Recipient address (0x...)"
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="recipient-input"
      />

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={transfer.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="transfer-button"
      >
        {transfer.isPending ? "Transferring..." : "Transfer"}
      </button>

      {transfer.isSuccess && (
        <p className="text-green-600" data-testid="transfer-success">
          Transfer successful! Tx: {transfer.data?.txHash}
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
