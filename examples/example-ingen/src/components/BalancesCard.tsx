"use client";

import { INGEN_EXPLORER_URL } from "@/lib/config";

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
  isDecrypting: boolean;
  decryptError?: string | null;
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
  isDecrypting,
  decryptError,
}: BalancesCardProps) {
  return (
    <section className="card" aria-labelledby="balances-title">
      <h2 className="card-title" id="balances-title">
        Balances
      </h2>
      <div className="balance-row">
        <div className="balance-label-group">
          <span className="balance-label">ERC-20 (public)</span>
          <form action={onMint}>
            <button
              type="submit"
              className="btn btn-sm btn-secondary"
              disabled={mintDisabled || isMinting}
            >
              {isMinting ? "Minting…" : `Mint ${erc20Symbol}`}
            </button>
          </form>
        </div>
        <output className="balance-value">{formattedErc20}</output>
      </div>
      <div className="balance-row">
        <span className="balance-label">Confidential (private)</span>
        {!isAllowed ? (
          <form action={onDecrypt}>
            <button type="submit" className="btn btn-sm btn-secondary" disabled={isDecrypting}>
              {isDecrypting ? "Signing…" : "Decrypt Balance"}
            </button>
          </form>
        ) : (
          <output className={`balance-value${isLoadingConfidential ? " loading" : ""}`}>
            {isLoadingConfidential ? <i>Decrypting…</i> : formattedConfidential}
          </output>
        )}
      </div>
      {decryptError && (
        <div className="alert alert-error card-status" role="alert">
          {decryptError}
        </div>
      )}
      {mintError && (
        <div className="alert alert-error card-status" role="alert">
          {mintError}
        </div>
      )}
      {mintTxHash && (
        <output className="alert alert-success card-status">
          Minted!{" "}
          <a href={`${INGEN_EXPLORER_URL}/tx/${mintTxHash}`} target="_blank" rel="noreferrer">
            {mintTxHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
