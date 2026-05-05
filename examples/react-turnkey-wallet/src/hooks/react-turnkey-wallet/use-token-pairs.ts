import { useMemo } from "react";
import { useListPairs } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function useTokenPairs(selectedTokenAddressState: Address | null) {
  const { data: pairsData, isPending: isRegistryPending } = useListPairs({ metadata: true });

  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (pair): pair is TokenWrapperPairWithMetadata => pair.isValid && "underlying" in pair,
      ),
    [pairsData],
  );

  const selectedTokenAddress =
    selectedTokenAddressState ?? validPairs[0]?.confidentialTokenAddress ?? null;

  const selectedPair = useMemo(
    () => validPairs.find((pair) => pair.confidentialTokenAddress === selectedTokenAddress) ?? null,
    [selectedTokenAddress, validPairs],
  );

  return {
    isRegistryPending,
    validPairs,
    selectedTokenAddress,
    selectedPair,
  };
}
