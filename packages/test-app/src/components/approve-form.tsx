"use client";

import {
  useConfidentialApprove,
  useConfidentialIsApproved,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function ApproveForm({
  tokenAddress,
  defaultSpender,
}: {
  tokenAddress: Address;
  defaultSpender?: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
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
      <h2 className="text-xl font-semibold">Approve {metadata?.symbol ?? "..."}</h2>

      {isApproved !== undefined && (
        <p className="text-sm text-gray-600" data-testid="approval-status">
          Approved: {isApproved ? "true" : "false"}
        </p>
      )}

      <input
        type="text"
        name="spender"
        placeholder="Spender address (0x...)"
        defaultValue={defaultSpender ?? ""}
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="spender-input"
      />

      <button
        type="submit"
        disabled={approve.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="approve-button"
      >
        {approve.isPending ? "Approving..." : "Approve"}
      </button>

      {approve.isSuccess && (
        <p className="text-green-600" data-testid="approve-success">
          Approved successfully! Tx: {approve.data}
        </p>
      )}

      {approve.isError && (
        <p className="text-red-600" data-testid="approve-error">
          Error: {approve.error.message}
        </p>
      )}
    </form>
  );
}
