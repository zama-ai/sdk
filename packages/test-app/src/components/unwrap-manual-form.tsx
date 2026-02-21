"use client";

import { useState } from "react";
import {
  useUnwrap,
  useFinalizeUnwrap,
  useConfidentialBalance,
  useTokenMetadata,
  useTokenSDK,
  findUnwrapRequested,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function UnwrapManualForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const [burnAmountHandle, setBurnAmountHandle] = useState<Address | null>(null);
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance(tokenAddress);
  const sdk = useTokenSDK();
  const unwrap = useUnwrap({ tokenAddress, wrapperAddress });
  const finalizeUnwrap = useFinalizeUnwrap({ tokenAddress, wrapperAddress });

  return (
    <div className="space-y-6">
      {/* Step 1: Unwrap */}
      <form
        action={async (formData) => {
          const txHash = await unwrap.mutateAsync({
            amount: BigInt(formData.get("amount") as string),
          });
          const receipt = await sdk.signer.waitForTransactionReceipt(txHash);
          const event = findUnwrapRequested(receipt.logs);
          if (event) {
            setBurnAmountHandle(event.encryptedAmount as Address);
          }
        }}
        className="space-y-4"
        data-testid="unwrap-form"
      >
        <h2 className="text-xl font-semibold">Step 1: Unwrap {metadata?.symbol ?? "..."}</h2>

        {balance !== undefined && (
          <p className="text-sm text-gray-600" data-testid="current-balance">
            Balance: {balance.toString()}
          </p>
        )}

        <input
          type="text"
          name="amount"
          placeholder="Amount"
          required
          className="w-full px-3 py-2 border rounded"
          data-testid="amount-input"
        />

        <button
          type="submit"
          disabled={unwrap.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          data-testid="unwrap-button"
        >
          {unwrap.isPending ? "Unwrapping..." : "Unwrap"}
        </button>

        {unwrap.isSuccess && (
          <p className="text-green-600" data-testid="unwrap-success">
            Unwrap requested! Tx: {unwrap.data}
          </p>
        )}

        {burnAmountHandle && (
          <p className="text-sm text-gray-600" data-testid="burn-handle">
            Burn handle: {burnAmountHandle}
          </p>
        )}

        {unwrap.isError && (
          <p className="text-red-600" data-testid="unwrap-error">
            Error: {unwrap.error.message}
          </p>
        )}
      </form>

      {/* Step 2: Finalize */}
      <form
        action={() => {
          if (!burnAmountHandle) return;
          finalizeUnwrap.mutate({ burnAmountHandle });
        }}
        className="space-y-4"
        data-testid="finalize-form"
      >
        <h2 className="text-xl font-semibold">Step 2: Finalize Unwrap</h2>

        <button
          type="submit"
          disabled={finalizeUnwrap.isPending || !burnAmountHandle}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          data-testid="finalize-button"
        >
          {finalizeUnwrap.isPending ? "Finalizing..." : "Finalize Unwrap"}
        </button>

        {finalizeUnwrap.isSuccess && (
          <p className="text-green-600" data-testid="finalize-success">
            Finalized successfully! Tx: {finalizeUnwrap.data}
          </p>
        )}

        {finalizeUnwrap.isError && (
          <p className="text-red-600" data-testid="finalize-error">
            Error: {finalizeUnwrap.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
