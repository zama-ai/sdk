"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { readSupportsInterfaceContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readSupportsInterfaceContract>;

export function useSupportsInterface(
  provider: Params[0],
  tokenAddress: Params[1] | undefined,
  interfaceId: Params[2] | undefined,
) {
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", provider, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(
        provider,
        tokenAddress as Params[1],
        interfaceId as Params[2],
      ),
    enabled,
  });
}

export function useSupportsInterfaceSuspense(
  provider: Params[0],
  tokenAddress: Params[1],
  interfaceId: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["supportsInterface", provider, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(provider, tokenAddress, interfaceId),
  });
}
