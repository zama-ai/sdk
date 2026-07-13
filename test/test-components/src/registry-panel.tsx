"use client";

import {
  useConfidentialTokenAddress,
  useIsConfidentialTokenValid,
  useListPairs,
  useTokenAddress,
  useTokenPair,
  useTokenPairsLength,
  useTokenPairsRegistry,
  useTokenPairsSlice,
  useWrappersRegistryAddress,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function RegistryPanel({
  tokenAddress,
  confidentialTokenAddress,
}: {
  tokenAddress: Address;
  confidentialTokenAddress: Address;
}) {
  const registryAddress = useWrappersRegistryAddress();
  const pairsLength = useTokenPairsLength();
  const pairs = useListPairs();
  const allPairs = useTokenPairsRegistry();
  const firstPair = useTokenPair({ index: 0n });
  const pairsSlice = useTokenPairsSlice({ fromIndex: 0n, toIndex: 1n });
  const confidentialLookup = useConfidentialTokenAddress({ tokenAddress });
  const tokenLookup = useTokenAddress({ confidentialTokenAddress });
  const isValid = useIsConfidentialTokenValid({ confidentialTokenAddress });

  return (
    <div className="space-y-8" data-testid="registry-panel">
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Registry Pairs</h2>
        {registryAddress && (
          <p className="text-sm text-zama-gray" data-testid="registry-address">
            Registry: {registryAddress}
          </p>
        )}
        {pairsLength.data !== undefined && (
          <p className="text-sm text-zama-gray" data-testid="registry-pairs-length">
            Total pairs: {pairsLength.data.toString()}
          </p>
        )}
        <ul className="space-y-1">
          {pairs.data?.items.map((pair) => (
            <li
              key={pair.confidentialTokenAddress}
              className="text-sm text-zama-gray"
              data-testid="registry-pair"
            >
              {pair.tokenAddress} → {pair.confidentialTokenAddress}
            </li>
          ))}
        </ul>
        {pairs.isError && (
          <p className="text-zama-error" data-testid="registry-pairs-error">
            Error: {pairs.error.message}
          </p>
        )}
        {allPairs.data && (
          <p className="text-sm text-zama-gray" data-testid="registry-all-pairs-count">
            All pairs: {allPairs.data.length}
          </p>
        )}
        {firstPair.data && (
          <p className="text-sm text-zama-gray" data-testid="registry-pair-at-index">
            Pair #0: {firstPair.data.tokenAddress} → {firstPair.data.confidentialTokenAddress}
          </p>
        )}
        {pairsSlice.data && (
          <p className="text-sm text-zama-gray" data-testid="registry-pairs-slice-count">
            Slice [0, 1): {pairsSlice.data.length}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Lookups</h2>
        {confidentialLookup.data && (
          <p className="text-sm text-zama-gray" data-testid="registry-confidential-lookup">
            Confidential token: {confidentialLookup.data[1]}
          </p>
        )}
        {tokenLookup.data && (
          <p className="text-sm text-zama-gray" data-testid="registry-token-lookup">
            Underlying token: {tokenLookup.data[1]}
          </p>
        )}
        {isValid.data !== undefined && (
          <p className="text-sm text-zama-gray" data-testid="registry-is-valid">
            Is valid confidential token: {String(isValid.data)}
          </p>
        )}
      </section>
    </div>
  );
}
