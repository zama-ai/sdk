import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import type { Address } from "viem";

export function useEthBalance(publicClient: PublicClient | null, walletAddress: Address) {
  return useQuery({
    queryKey: ["ethBalance", walletAddress],
    enabled: !!publicClient,
    queryFn: async () => publicClient!.getBalance({ address: walletAddress }),
  });
}
