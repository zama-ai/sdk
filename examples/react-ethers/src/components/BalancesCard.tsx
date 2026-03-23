"use client";

interface BalancesCardProps {
  formattedErc20: string;
  formattedConfidential: string;
  isLoadingConfidential: boolean;
  erc20Symbol: string;
  onMint: () => void;
  isMinting: boolean;
  mintDisabled: boolean;
}

export function BalancesCard({
  formattedErc20,
  formattedConfidential,
  isLoadingConfidential,
  erc20Symbol,
  onMint,
  isMinting,
  mintDisabled,
}: BalancesCardProps) {
  const confidentialDisplay = isLoadingConfidential ? <i>Decrypting…</i> : formattedConfidential;

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
        <span className={`balance-value${isLoadingConfidential ? " loading" : ""}`}>
          {confidentialDisplay}
        </span>
      </div>
    </div>
  );
}
