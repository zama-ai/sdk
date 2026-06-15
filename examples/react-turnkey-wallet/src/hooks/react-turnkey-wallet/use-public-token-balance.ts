import { useQuery } from "@tanstack/react-query";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import { balanceOfContract } from "@zama-fhe/sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import type { Address } from "viem";

export function usePublicTokenBalance(
  selectedPair: TokenWrapperPairWithMetadata | null,
  walletAddress: Address,
) {
  const sdk = useZamaSDK();

  const { data: publicBalance, refetch: refetchPublicBalance } = useQuery({
    queryKey: ["publicBalance", selectedPair?.tokenAddress, walletAddress],
    enabled: !!selectedPair,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!selectedPair) {
        throw new Error("No token selected");
      }

      return (await sdk.provider.readContract(
        balanceOfContract(selectedPair.tokenAddress, walletAddress),
      )) as bigint;
    },
  });

  return { publicBalance, refetchPublicBalance };
}
