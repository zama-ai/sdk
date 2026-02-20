"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { readSupportsInterfaceContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readSupportsInterfaceContract>;

export function useSupportsInterface(
  client: Params[0],
  tokenAddress: Params[1] | undefined,
  interfaceId: Params[2] | undefined,
) {
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", client, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(
        client,
        tokenAddress as Params[1],
        interfaceId as Params[2],
      ),
    enabled,
  });
}

export function useSupportsInterfaceSuspense(
  client: Params[0],
  tokenAddress: Params[1],
  interfaceId: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["supportsInterface", client, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(client, tokenAddress, interfaceId),
  });
}
