"use client";

import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface BalancesCardProps {
  formattedErc20: string;
  formattedConfidential: string;
  isLoadingConfidential: boolean;
  erc20Symbol: string;
  onMint: () => void;
  isMinting: boolean;
  mintDisabled: boolean;
  mintError?: string | null;
  mintTxHash?: string | null;
  isAllowed: boolean;
  onDecrypt: () => void;
  onDecryptPreview?: () => void;
  isDecrypting: boolean;
  isPreviewingDecrypt?: boolean;
  decryptDisabled?: boolean;
  decryptError?: string | null;
  decryptPreviewError?: string | null;
}

export function BalancesCard({
  formattedErc20,
  formattedConfidential,
  isLoadingConfidential,
  erc20Symbol,
  onMint,
  isMinting,
  mintDisabled,
  mintError,
  mintTxHash,
  isAllowed,
  onDecrypt,
  onDecryptPreview,
  isDecrypting,
  isPreviewingDecrypt = false,
  decryptDisabled = false,
  decryptError,
  decryptPreviewError,
}: BalancesCardProps) {
  return (
    <div className="card">
      <div className="card-title">Balances</div>
      <div className="balance-row">
        <span className="balance-label-group">
          <span className="balance-label">ERC-20 (public)</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={onMint}
            disabled={mintDisabled || isMinting}
          >
            {isMinting ? "Minting…" : `Mint ${erc20Symbol}`}
          </button>
        </span>
        <span className="balance-value">{formattedErc20}</span>
      </div>
      <div className="balance-row">
        <span className="balance-label">Confidential (private)</span>
        {!isAllowed ? (
          <span className="balance-actions">
            {onDecryptPreview && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onDecryptPreview}
                disabled={decryptDisabled || isPreviewingDecrypt}
              >
                {isPreviewingDecrypt ? "Previewing…" : "Preview intent"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={onDecrypt}
              disabled={decryptDisabled || isDecrypting}
            >
              {isDecrypting ? "Signing…" : "Decrypt Balance"}
            </button>
          </span>
        ) : (
          <span className={`balance-value${isLoadingConfidential ? " loading" : ""}`}>
            {isLoadingConfidential ? <i>Decrypting…</i> : formattedConfidential}
          </span>
        )}
      </div>
      {decryptPreviewError && (
        <div className="alert alert-error card-status">{decryptPreviewError}</div>
      )}
      {decryptError && <div className="alert alert-error card-status">{decryptError}</div>}
      {mintError && <div className="alert alert-error card-status">{mintError}</div>}
      {mintTxHash && (
        <div className="alert alert-success card-status">
          Minted!{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${mintTxHash}`} target="_blank" rel="noreferrer">
            {mintTxHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
