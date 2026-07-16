"use client";

import type { Address } from "@zama-fhe/sdk";
import {
  useApproveUnderlying,
  useUnderlyingAllowance,
  useMetadata,
  useWrap,
} from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

export function WrapManualForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: allowance } = useUnderlyingAllowance({ address: wrapperAddress, owner: address });
  const approve = useApproveUnderlying(wrapperAddress);
  const wrap = useWrap(wrapperAddress);

  return (
    <div className="space-y-6">
      {/* Step 1: Approve */}
      <form
        action={(formData) => {
          approve.mutate({ amount: BigInt(formData.get("amount") as string) });
        }}
        className="space-y-4"
        data-testid="approve-form"
      >
        <h2 className="text-xl font-semibold text-white">
          Step 1: Approve {metadata?.symbol ?? "..."}
        </h2>

        {allowance !== undefined && (
          <p className="text-sm text-zama-gray" data-testid="allowance">
            Current allowance: {allowance.toString()}
          </p>
        )}

        <input
          type="text"
          name="amount"
          placeholder="Amount"
          aria-label="Approve amount"
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="approve-amount-input"
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
            Approved! Tx: {approve.data?.txHash}
          </p>
        )}

        {approve.isError && (
          <p className="text-zama-error" data-testid="approve-error">
            Error: {approve.error.message}
          </p>
        )}
      </form>

      {/* Step 2: Wrap */}
      <form
        action={(formData) => {
          wrap.mutate({ amount: BigInt(formData.get("amount") as string) });
        }}
        className="space-y-4"
        data-testid="wrap-form"
      >
        <h2 className="text-xl font-semibold text-white">
          Step 2: Wrap {metadata?.symbol ?? "..."}
        </h2>

        <input
          type="text"
          name="amount"
          placeholder="Amount"
          aria-label="Wrap amount"
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="wrap-amount-input"
        />

        <button
          type="submit"
          disabled={wrap.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="wrap-button"
        >
          {wrap.isPending ? "Wrapping..." : "Wrap"}
        </button>

        {wrap.isSuccess && (
          <p className="text-zama-success" data-testid="wrap-success">
            Wrapped successfully! Tx: {wrap.data?.txHash}
          </p>
        )}

        {wrap.isError && (
          <p className="text-zama-error" data-testid="wrap-error">
            Error: {wrap.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
