"use client";

import { useState } from "react";
import { type Address, findUnwrapRequested, type Hex } from "@zama-fhe/sdk";
import {
  useUnwrap,
  useFinalizeUnwrap,
  useConfidentialBalance,
  useMetadata,
} from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

type FinalizeUnwrapInput =
  | { label: "Unwrap request ID"; params: { unwrapRequestId: Hex } }
  | { label: "Legacy burn handle"; params: { burnAmountHandle: Hex } };

export function UnwrapManualForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const [finalizeInput, setFinalizeInput] = useState<FinalizeUnwrapInput | null>(null);
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress, account: address });
  const unwrap = useUnwrap({ tokenAddress, wrapperAddress });
  const finalizeUnwrap = useFinalizeUnwrap({ tokenAddress, wrapperAddress });

  return (
    <div className="space-y-6">
      {/* Step 1: Unwrap */}
      <form
        action={async (formData) => {
          const result = await unwrap.mutateAsync({
            amount: BigInt(formData.get("amount") as string),
          });
          const event = findUnwrapRequested(result.receipt.logs);
          if (event) {
            setFinalizeInput(
              event.unwrapRequestId
                ? {
                    label: "Unwrap request ID",
                    params: { unwrapRequestId: event.unwrapRequestId },
                  }
                : {
                    label: "Legacy burn handle",
                    params: { burnAmountHandle: event.encryptedAmount },
                  },
            );
          }
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
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="amount-input"
        />

        <button
          type="submit"
          disabled={unwrap.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="unwrap-button"
        >
          {unwrap.isPending ? "Unwrapping..." : "Unwrap"}
        </button>

        {unwrap.isSuccess && (
          <p className="text-zama-success" data-testid="unwrap-success">
            Unwrap requested! Tx: {unwrap.data?.txHash}
          </p>
        )}

        {finalizeInput && (
          <p className="text-sm text-zama-gray" data-testid="burn-handle">
            {finalizeInput.label}:{" "}
            {"unwrapRequestId" in finalizeInput.params
              ? finalizeInput.params.unwrapRequestId
              : finalizeInput.params.burnAmountHandle}
          </p>
        )}

        {unwrap.isError && (
          <p className="text-zama-error" data-testid="unwrap-error">
            Error: {unwrap.error.message}
          </p>
        )}
      </form>

      {/* Step 2: Finalize */}
      <form
        action={() => {
          if (!finalizeInput) {
            return;
          }
          finalizeUnwrap.mutate(finalizeInput.params);
        }}
        className="space-y-4"
        data-testid="finalize-form"
      >
        <h2 className="text-xl font-semibold text-white">Step 2: Finalize Unwrap</h2>

        <button
          type="submit"
          disabled={finalizeUnwrap.isPending || !finalizeInput}
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
