"use client";

import { useUnshield, useConfidentialBalance, useMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function UnshieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const unshield = useUnshield({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        unshield.mutate({
          amount: BigInt(formData.get("amount") as string),
          skipBalanceCheck: true,
        });
      }}
      className="space-y-4"
      data-testid="unshield-form"
    >
      <h2 className="text-xl font-semibold text-white">Unshield {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

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
        disabled={unshield.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="unshield-button"
      >
        {unshield.isPending ? "Unshielding..." : "Unshield"}
      </button>

      {unshield.isSuccess && (
        <p className="text-zama-success" data-testid="unshield-success">
          Unshielded successfully! Tx: {unshield.data?.txHash}
        </p>
      )}

      {unshield.isError && (
        <p className="text-zama-error" data-testid="unshield-error">
          Error: {unshield.error.message}
        </p>
      )}
    </form>
  );
}
