"use client";

import {
  useConfidentialSetOperator,
  useConfidentialIsOperator,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

export function ApproveForm({
  tokenAddress,
  defaultSpender,
}: {
  tokenAddress: Address;
  defaultSpender?: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const setOperator = useConfidentialSetOperator({ tokenAddress });
  const { data: isOperator } = useConfidentialIsOperator({
    tokenAddress,
    spender: defaultSpender,
    holder: address,
  });

  return (
    <form
      action={(formData) => {
        setOperator.mutate({ operator: formData.get("operator") as Address });
      }}
      className="space-y-4"
      data-testid="approve-form"
    >
      <h2 className="text-xl font-semibold text-white">Set Operator {metadata?.symbol ?? "..."}</h2>

      {isOperator !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="approval-status">
          Approved: {isOperator ? "true" : "false"}
        </p>
      )}

      <input
        type="text"
        name="operator"
        placeholder="Operator address (0x...)"
        defaultValue={defaultSpender ?? ""}
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="spender-input"
      />

      <button
        type="submit"
        disabled={setOperator.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="approve-button"
      >
        {setOperator.isPending ? "Approving..." : "Approve"}
      </button>

      {setOperator.isSuccess && (
        <p className="text-zama-success" data-testid="approve-success">
          Approved successfully! Tx: {setOperator.data?.txHash}
        </p>
      )}

      {setOperator.isError && (
        <p className="text-zama-error" data-testid="approve-error">
          Error: {setOperator.error.message}
        </p>
      )}
    </form>
  );
}
