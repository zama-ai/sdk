import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
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
    <section className="card" aria-labelledby="turnkey-token-selector-title">
      <h2 className="card-title" id="turnkey-token-selector-title">
        Token
      </h2>
      {isRegistryPending ? (
        <output className="block text-sm text-zinc-500">Loading tokens from registry…</output>
      ) : (
        <>
          <label className="sr-only" htmlFor="turnkey-token-selector">
            Confidential token
          </label>
          <select
            id="turnkey-token-selector"
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
        </>
      )}
    </section>
  );
}
