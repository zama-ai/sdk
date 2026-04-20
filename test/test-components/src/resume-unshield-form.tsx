"use client";

import { useState } from "react";
import {
  useUnwrap,
  useResumeUnshield,
  useConfidentialBalance,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function ResumeUnshieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const [unwrapTxHash, setUnwrapTxHash] = useState<string | null>(null);
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const unwrap = useUnwrap({ tokenAddress, wrapperAddress });
  const resumeUnshield = useResumeUnshield({ tokenAddress, wrapperAddress });

  return (
    <div className="space-y-6">
      {/* Step 1: Unwrap (phase 1 only) */}
      <form
        action={async (formData) => {
          const result = await unwrap.mutateAsync({
            amount: BigInt(formData.get("amount") as string),
          });
          setUnwrapTxHash(result.txHash);
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

        {unwrapTxHash && (
          <p className="text-sm text-zama-gray" data-testid="unwrap-tx-hash">
            {unwrapTxHash}
          </p>
        )}

        {unwrap.isError && (
          <p className="text-zama-error" data-testid="unwrap-error">
            Error: {unwrap.error.message}
          </p>
        )}
      </form>

      {/* Step 2: Resume unshield from tx hash */}
      <form
        action={() => {
          if (!unwrapTxHash) {
            return;
          }
          resumeUnshield.mutate({ unwrapTxHash: unwrapTxHash as `0x${string}` });
        }}
        className="space-y-4"
        data-testid="resume-form"
      >
        <h2 className="text-xl font-semibold text-white">Step 2: Resume Unshield</h2>

        <button
          type="submit"
          disabled={resumeUnshield.isPending || !unwrapTxHash}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="resume-button"
        >
          {resumeUnshield.isPending ? "Resuming..." : "Resume Unshield"}
        </button>

        {resumeUnshield.isSuccess && (
          <p className="text-zama-success" data-testid="resume-success">
            Unshield resumed! Tx: {resumeUnshield.data?.txHash}
          </p>
        )}

        {resumeUnshield.isError && (
          <p className="text-zama-error" data-testid="resume-error">
            Error: {resumeUnshield.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
