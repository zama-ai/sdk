import { formatUnits } from "viem";

export function BalanceAmount({
  value,
  decimals,
  symbol,
}: {
  value: bigint | null;
  decimals: number;
  symbol: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {value !== null ? formatUnits(value, decimals) : "—"}
      </span>
      <span className="text-xs text-zinc-400">{symbol}</span>
    </div>
  );
}
