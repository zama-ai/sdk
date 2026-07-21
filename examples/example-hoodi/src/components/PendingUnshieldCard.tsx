"use client";

import { useResumeUnshield, usePendingUnshield } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { HOODI_EXPLORER_URL } from "@/lib/config";

interface PendingUnshieldCardProps {
  token: TokenWrapperPairWithMetadata;
  onSuccess?: () => void;
}

export function PendingUnshieldCard({ token, onSuccess }: PendingUnshieldCardProps) {
  const tokenAddress = token.confidentialTokenAddress;
  const label = token.underlying.symbol;

  const { data: pendingTxHash } = usePendingUnshield(tokenAddress);

  const resume = useResumeUnshield(tokenAddress, {
    onSuccess: () => {
      onSuccess?.();
    },
  });

  if (!pendingTxHash) return null;

  return (
    <section className="card">
      <h2 className="card-title">Pending Unshield — {label}</h2>
      <div className="balance-row">
        <span className="balance-label">
          Unwrap confirmed, finalization pending —{" "}
          <a href={`${HOODI_EXPLORER_URL}/tx/${pendingTxHash}`} target="_blank" rel="noreferrer">
            {pendingTxHash.slice(0, 10)}…
          </a>
        </span>
        <form action={() => resume.mutate({ unwrapTxHash: pendingTxHash })}>
          <button type="submit" className="btn btn-primary" disabled={resume.isPending}>
            {resume.isPending ? "Finalizing…" : "Finalize"}
          </button>
        </form>
      </div>
      {resume.isError && (
        <div className="alert alert-error card-status" role="alert">
          {resume.error?.message}
        </div>
      )}
      {resume.isSuccess && resume.data?.txHash && (
        <output className="alert alert-success card-status">
          Unshielded!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${resume.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {resume.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
