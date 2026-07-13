"use client";

import type { Address } from "@zama-fhe/sdk";
import {
  useApproveUnderlying,
  useShield,
  useUnderlyingAllowance,
  useMetadata,
} from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

export function ShieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: allowance } = useUnderlyingAllowance({ address: wrapperAddress, owner: address });
  const shield = useShield({ address: wrapperAddress });
  const approveUnderlying = useApproveUnderlying(wrapperAddress);

  return (
    <form
      action={(formData) => {
        shield.mutate({ amount: BigInt(formData.get("amount") as string) });
      }}
      className="space-y-4"
      data-testid="shield-form"
    >
      <h2 className="text-xl font-semibold text-white">Shield {metadata?.symbol ?? "..."}</h2>

      {allowance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="allowance">
          Current allowance: {allowance.toString()}
        </p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          name="approve-amount"
          placeholder="Approve amount (empty = max)"
          aria-label="Approve amount"
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="approve-amount-input"
        />
        <button
          type="button"
          onClick={(event) => {
            const input = event.currentTarget.form?.elements.namedItem(
              "approve-amount",
            ) as HTMLInputElement | null;
            const amount = input?.value ? BigInt(input.value) : undefined;
            approveUnderlying.mutate({ amount });
          }}
          disabled={approveUnderlying.isPending}
          className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border disabled:opacity-50 transition-colors whitespace-nowrap"
          data-testid="approve-underlying-button"
        >
          {approveUnderlying.isPending ? "Approving..." : "Approve"}
        </button>
      </div>

      {approveUnderlying.isSuccess && (
        <p className="text-zama-success" data-testid="approve-underlying-success">
          Approved! Tx: {approveUnderlying.data?.txHash}
        </p>
      )}
      {approveUnderlying.isError && (
        <p className="text-zama-error" data-testid="approve-underlying-error">
          Error: {approveUnderlying.error.message}
        </p>
      )}

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        aria-label="Amount"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={shield.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="shield-button"
      >
        {shield.isPending ? "Shielding..." : "Shield"}
      </button>

      {shield.isSuccess && (
        <p className="text-zama-success" data-testid="shield-success">
          Shielded successfully! Tx: {shield.data?.txHash}
        </p>
      )}

      {shield.isError && (
        <p className="text-zama-error" data-testid="shield-error">
          Error: {shield.error.message}
        </p>
      )}
    </form>
  );
}
