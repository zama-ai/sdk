import type { ReactNode } from "react";
import { formatEther } from "viem";

export function WalletHeader({
  walletAddressLabel,
  networkName,
  ethBalance,
}: {
  walletAddressLabel: ReactNode;
  networkName: string;
  ethBalance: bigint | undefined;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
        Turnkey × Zama — Confidential Tokens
      </h1>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
        <span>Wallet: {walletAddressLabel}</span>
        <span>{networkName}</span>
        <span>
          ETH: {ethBalance !== undefined ? parseFloat(formatEther(ethBalance)).toFixed(4) : "…"}
        </span>
      </div>
    </div>
  );
}
