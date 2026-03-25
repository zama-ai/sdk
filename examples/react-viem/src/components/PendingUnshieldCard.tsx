"use client";

import { useEffect, useState } from "react";
import {
  useZamaSDK,
  useResumeUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "@zama-fhe/react-sdk";
import type { Address, Hex } from "@zama-fhe/react-sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface PendingUnshieldCardProps {
  tokenAddress: Address;
  label: string;
  onSuccess?: () => void;
}

export function PendingUnshieldCard({ tokenAddress, label, onSuccess }: PendingUnshieldCardProps) {
  const { storage } = useZamaSDK();
  const [pendingTxHash, setPendingTxHash] = useState<Hex | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadPendingUnshield(storage, tokenAddress)
      .then(setPendingTxHash)
      .catch((err) => {
        console.error("[PendingUnshieldCard] loadPendingUnshield failed:", err);
        setLoadError(true);
      });
  }, [storage, tokenAddress]);

  const resume = useResumeUnshield(
    // For ERC-7984 tokens, the wrapper IS the token — tokenAddress and wrapperAddress are the same.
    { tokenAddress, wrapperAddress: tokenAddress },
    {
      onSuccess: () => {
        clearPendingUnshield(storage, tokenAddress).catch((err) =>
          console.error("[PendingUnshieldCard] Failed to clear pending unshield:", err),
        );
        setPendingTxHash(null);
        onSuccess?.();
      },
    },
  );

  if (loadError) {
    return (
      <div className="card">
        <div className="card-title">Pending Unshield — {label}</div>
        <div className="alert alert-error card-status">
          Unable to load pending unshield state. If you have an interrupted unshield, check your
          browser&apos;s storage settings.
        </div>
      </div>
    );
  }

  if (!pendingTxHash) return null;

  return (
    <div className="card">
      <div className="card-title">Pending Unshield — {label}</div>
      <div className="balance-row">
        <span className="balance-label">
          Unwrap confirmed, finalization pending —{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${pendingTxHash}`} target="_blank" rel="noreferrer">
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
            href={`${SEPOLIA_EXPLORER_URL}/tx/${resume.data.txHash}`}
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
