"use client";

import { useUnshieldAll, useConfidentialBalance, useMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

export function UnshieldAllForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress, account: address });
  const unshieldAll = useUnshieldAll({ tokenAddress, wrapperAddress });

  return (
    <form
      action={() => {
        unshieldAll.mutate();
      }}
      className="space-y-4"
      data-testid="unshield-all-form"
    >
      <h2 className="text-xl font-semibold text-white">Unshield All {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <button
        type="submit"
        disabled={unshieldAll.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="unshield-all-button"
      >
        {unshieldAll.isPending ? "Unshielding All..." : "Unshield All"}
      </button>

      {unshieldAll.isSuccess && (
        <p className="text-zama-success" data-testid="unshield-all-success">
          Unshielded all successfully! Tx: {unshieldAll.data?.txHash}
        </p>
      )}

      {unshieldAll.isError && (
        <p className="text-zama-error" data-testid="unshield-all-error">
          Error: {unshieldAll.error.message}
        </p>
      )}
    </form>
  );
}
