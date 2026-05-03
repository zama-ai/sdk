import type { TokenWrapperPairWithMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function TokenSelectorCard({
  isRegistryPending,
  selectedTokenAddress,
  validPairs,
  onSelect,
}: {
  isRegistryPending: boolean;
  selectedTokenAddress: Address | null;
  validPairs: TokenWrapperPairWithMetadata[];
  onSelect: (address: Address) => void;
}) {
  return (
    <div className="card">
      <div className="card-title">Token</div>
      {isRegistryPending ? (
        <p className="text-sm text-zinc-500">Loading tokens from registry…</p>
      ) : (
        <select
          value={selectedTokenAddress ?? ""}
          onChange={(event) => onSelect(event.target.value as Address)}
          className="input w-full"
        >
          {validPairs.map((pair) => (
            <option key={pair.confidentialTokenAddress} value={pair.confidentialTokenAddress}>
              {pair.confidential.symbol} / {pair.underlying.symbol}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
