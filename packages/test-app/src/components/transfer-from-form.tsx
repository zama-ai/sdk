"use client";

import {
  useConfidentialTransferFrom,
  useConfidentialBalance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function TransferFromForm({
  tokenAddress,
  defaultFrom,
  wrapperAddress,
}: {
  tokenAddress: Address;
  defaultFrom?: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
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
      <h2 className="text-xl font-semibold">Transfer From {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="from"
        placeholder="From address (0x...)"
        defaultValue={defaultFrom ?? ""}
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="from-input"
      />

      <input
        type="text"
        name="to"
        placeholder="To address (0x...)"
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="to-input"
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
        disabled={transferFrom.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="transfer-from-button"
      >
        {transferFrom.isPending ? "Transferring..." : "Transfer From"}
      </button>

      {transferFrom.isSuccess && (
        <p className="text-green-600" data-testid="transfer-from-success">
          Transfer successful! Tx: {transferFrom.data}
        </p>
      )}

      {transferFrom.isError && (
        <p className="text-red-600" data-testid="transfer-from-error">
          Error: {transferFrom.error.message}
        </p>
      )}
    </form>
  );
}
