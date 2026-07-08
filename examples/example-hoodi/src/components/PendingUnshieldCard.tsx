"use client";

import { useResumeUnshield, usePendingUnshield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { HOODI_EXPLORER_URL } from "@/lib/config";

interface PendingUnshieldCardProps {
  tokenAddress: Address;
  label: string;
  onSuccess?: () => void;
}

export function PendingUnshieldCard({ tokenAddress, label, onSuccess }: PendingUnshieldCardProps) {
  const { data: pendingTxHash } = usePendingUnshield(tokenAddress);

  const resume = useResumeUnshield(tokenAddress, {
    onSuccess: () => {
      onSuccess?.();
    },
  });

  if (!pendingTxHash) return null;

  return (
    <div className="card">
      <div className="card-title">Pending Unshield — {label}</div>
      <div className="balance-row">
        <span className="balance-label">
          Unwrap confirmed, finalization pending —{" "}
          <a href={`${HOODI_EXPLORER_URL}/tx/${pendingTxHash}`} target="_blank" rel="noreferrer">
            {pendingTxHash.slice(0, 10)}…
          </a>
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => resume.mutate({ unwrapTxHash: pendingTxHash })}
          disabled={resume.isPending}
        >
          {resume.isPending ? "Finalizing…" : "Finalize"}
        </button>
      </div>
      {resume.isError && (
        <div className="alert alert-error card-status">{resume.error?.message}</div>
      )}
      {resume.isSuccess && resume.data?.txHash && (
        <div className="alert alert-success card-status">
          Unshielded!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${resume.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {resume.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
