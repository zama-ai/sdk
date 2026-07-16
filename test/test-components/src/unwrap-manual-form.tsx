"use client";

import {
  useConfidentialBalance,
  useFinalizeUnwrap,
  useMetadata,
  useUnwrap,
  useUnwrapAll,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

export function UnwrapManualForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ address: tokenAddress, account: address });
  const unwrap = useUnwrap(wrapperAddress);
  const unwrapAll = useUnwrapAll(wrapperAddress);
  const finalizeUnwrap = useFinalizeUnwrap(wrapperAddress);

  return (
    <div className="space-y-6">
      {/* Step 1: Unwrap */}
      <form
        action={(formData) => {
          unwrap.mutate({ amount: BigInt(formData.get("amount") as string) });
        }}
        className="space-y-4"
        data-testid="unwrap-form"
      >
        <h2 className="text-xl font-semibold text-white">
          Step 1: Unwrap {metadata?.symbol ?? "..."}
        </h2>

        {balance !== undefined && (
          <p className="text-sm text-zama-gray" data-testid="current-balance">
            Balance: {balance.toString()}
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

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={unwrap.isPending}
            className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
            data-testid="unwrap-button"
          >
            {unwrap.isPending ? "Unwrapping..." : "Unwrap"}
          </button>

          <button
            type="button"
            onClick={() => {
              unwrapAll.mutate();
            }}
            disabled={unwrapAll.isPending}
            className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border disabled:opacity-50 transition-colors"
            data-testid="unwrap-all-button"
          >
            {unwrapAll.isPending ? "Unwrapping..." : "Unwrap All"}
          </button>
        </div>

        {unwrap.isSuccess && (
          <p className="text-zama-success" data-testid="unwrap-success">
            Unwrap requested! Tx: {unwrap.data?.txHash}
          </p>
        )}

        {unwrap.data?.unwrapRequestId && (
          <p className="text-sm text-zama-gray" data-testid="burn-handle">
            Unwrap request ID: {unwrap.data?.unwrapRequestId}
          </p>
        )}

        {unwrapAll.isSuccess && (
          <p className="text-zama-success" data-testid="unwrap-all-success">
            Unwrap all requested! Tx: {unwrapAll.data?.txHash}
          </p>
        )}

        {unwrap.isError && (
          <p className="text-zama-error" data-testid="unwrap-error">
            Error: {unwrap.error.message}
          </p>
        )}

        {unwrapAll.isError && (
          <p className="text-zama-error" data-testid="unwrap-all-error">
            Error: {unwrapAll.error.message}
          </p>
        )}
      </form>

      {/* Step 2: Finalize */}
      <form
        action={() => {
          if (!unwrap.isSuccess) {
            return;
          }
          finalizeUnwrap.mutate(unwrap.data);
        }}
        className="space-y-4"
        data-testid="finalize-form"
      >
        <h2 className="text-xl font-semibold text-white">Step 2: Finalize Unwrap</h2>

        <button
          type="submit"
          disabled={finalizeUnwrap.isPending || !unwrap.data?.unwrapRequestId}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="finalize-button"
        >
          {finalizeUnwrap.isPending ? "Finalizing..." : "Finalize Unwrap"}
        </button>

        {finalizeUnwrap.isSuccess && (
          <p className="text-zama-success" data-testid="finalize-success">
            Finalized successfully! Tx: {finalizeUnwrap.data?.txHash}
          </p>
        )}

        {finalizeUnwrap.isError && (
          <p className="text-zama-error" data-testid="finalize-error">
            Error: {finalizeUnwrap.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
