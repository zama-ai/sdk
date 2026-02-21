"use client";

import {
  useUnshieldAll,
  useConfidentialBalance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function UnshieldAllForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance(tokenAddress);
  const unshieldAll = useUnshieldAll({ tokenAddress, wrapperAddress });

  return (
    <form
      action={() => {
        unshieldAll.mutate();
      }}
      className="space-y-4"
      data-testid="unshield-all-form"
    >
      <h2 className="text-xl font-semibold">Unshield All {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <button
        type="submit"
        disabled={unshieldAll.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="unshield-all-button"
      >
        {unshieldAll.isPending ? "Unshielding All..." : "Unshield All"}
      </button>

      {unshieldAll.isSuccess && (
        <p className="text-green-600" data-testid="unshield-all-success">
          Unshielded all successfully! Tx: {unshieldAll.data}
        </p>
      )}

      {unshieldAll.isError && (
        <p className="text-red-600" data-testid="unshield-all-error">
          Error: {unshieldAll.error.message}
        </p>
      )}
    </form>
  );
}
