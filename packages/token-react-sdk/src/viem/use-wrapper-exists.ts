"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { readWrapperExistsContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readWrapperExistsContract>;

export function useWrapperExists(
  client: Params[0],
  coordinator: Params[1] | undefined,
  tokenAddress: Params[2] | undefined,
) {
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", client, coordinator, tokenAddress],
    queryFn: () =>
      readWrapperExistsContract(
        client,
        coordinator as Address,
        tokenAddress as Address,
      ),
    enabled,
  });
}

export function useWrapperExistsSuspense(
  client: Params[0],
  coordinator: Params[1],
  tokenAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["wrapperExists", client, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(client, coordinator, tokenAddress),
  });
}
