import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/react-sdk";
import { BalanceAmount } from "./balance-amount";

export function BalancesCard({
  publicBalance,
  tokenAddress,
  isBalanceRequested,
  onReveal,
  isTestnet,
  isMinting,
  mintError,
  onMint,
  selectedPair,
}: {
  publicBalance: bigint | null;
  tokenAddress: Address;
  isBalanceRequested: boolean;
  onReveal: () => void;
  isTestnet: boolean;
  isMinting: boolean;
  mintError: string | null;
  onMint: () => void;
  selectedPair: TokenWrapperPairWithMetadata;
}) {
  const {
    data: confidentialBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    error: balanceError,
  } = useConfidentialBalance({ tokenAddress }, { enabled: isBalanceRequested });

  return (
    <div className="card">
      <div className="card-title">Balances</div>

      <div className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm text-zinc-500">Public (ERC-20)</span>
        <div className="flex items-center gap-2.5">
          <BalanceAmount
            value={publicBalance}
            decimals={selectedPair.underlying.decimals}
            symbol={selectedPair.underlying.symbol}
          />
          {isTestnet && (
            <button
              onClick={onMint}
              disabled={isMinting}
              className="btn btn-secondary py-0.5 px-2 text-xs"
            >
              {isMinting ? "Minting…" : "Mint 10"}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm text-zinc-500">Confidential (Private)</span>
        {!isBalanceRequested ? (
          <button onClick={onReveal} className="btn btn-secondary py-0.5 px-2 text-xs">
            Reveal
          </button>
        ) : isBalanceLoading ? (
          <span className="text-sm text-zinc-400">Decrypting…</span>
        ) : isBalanceError ? (
          <span className="text-sm text-red-500">Error</span>
        ) : (
          <BalanceAmount
            value={confidentialBalance ?? null}
            decimals={selectedPair.confidential.decimals}
            symbol={selectedPair.confidential.symbol}
          />
        )}
      </div>

      {isTestnet && mintError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">{mintError}</p>
      )}
      {isBalanceError && balanceError && (
        <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1 break-all">
          {balanceError instanceof Error ? balanceError.message : String(balanceError)}
        </p>
      )}
    </div>
  );
}
