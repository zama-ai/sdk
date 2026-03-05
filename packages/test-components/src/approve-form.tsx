"use client";

import {
  useConfidentialApprove,
  useConfidentialIsApproved,
  useMetadata,
  type Address,
} from "@zama-fhe/react-sdk";

export function ApproveForm({
  tokenAddress,
  defaultSpender,
}: {
  tokenAddress: Address;
  defaultSpender?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const approve = useConfidentialApprove({ tokenAddress });
  const { data: isApproved } = useConfidentialIsApproved({ tokenAddress, spender: defaultSpender });

  return (
    <form
      action={(formData) => {
        approve.mutate({ spender: formData.get("spender") as Address });
      }}
      className="space-y-4"
      data-testid="approve-form"
    >
      <h2 className="text-xl font-semibold text-white">Approve {metadata?.symbol ?? "..."}</h2>

      {isApproved !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="approval-status">
          Approved: {isApproved ? "true" : "false"}
        </p>
      )}

      <input
        type="text"
        name="spender"
        placeholder="Spender address (0x...)"
        defaultValue={defaultSpender ?? ""}
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="spender-input"
      />

      <button
        type="submit"
        disabled={approve.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="approve-button"
      >
        {approve.isPending ? "Approving..." : "Approve"}
      </button>

      {approve.isSuccess && (
        <p className="text-zama-success" data-testid="approve-success">
          Approved successfully! Tx: {approve.data?.txHash}
        </p>
      )}

      {approve.isError && (
        <p className="text-zama-error" data-testid="approve-error">
          Error: {approve.error.message}
        </p>
      )}
    </form>
  );
}
