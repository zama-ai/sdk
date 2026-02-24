"use client";

import type { Address } from "@zama-fhe/token-sdk";
import { balanceOfContract, decimalsContract, symbolContract } from "@zama-fhe/token-sdk";
import { formatUnits } from "viem";
import { useConnection, useReadContracts } from "wagmi";

export interface UseBalanceOfConfig {
  tokenAddress: Address;
  userAddress?: Address;
}

export type UseBalanceOfResult = Omit<ReturnType<typeof useReadContracts>, "data"> & {
  data: {
    value: bigint | undefined;
    symbol: string | undefined;
    decimals: number | undefined;
    formatted: string | undefined;
  };
};

export function useBalanceOf(config: UseBalanceOfConfig): UseBalanceOfResult {
  const { address: connectedAddress } = useConnection();
  const { tokenAddress, userAddress = connectedAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;

  const { data, ...query } = useReadContracts({
    contracts: [
      symbolContract(tokenAddress),
      decimalsContract(tokenAddress),
      enabled ? balanceOfContract(tokenAddress, userAddress) : {},
    ],
    query: { enabled },
  });

  const symbol = data?.[0]?.result as string | undefined;
  const decimals = data?.[1]?.result as number | undefined;
  const value = data?.[2]?.result as bigint | undefined;
  const formatted =
    value !== undefined && decimals !== undefined ? formatUnits(value, decimals) : undefined;

  return {
    data: { value, symbol, decimals, formatted },
    ...query,
  };
}

export interface UseBalanceOfSuspenseConfig {
  tokenAddress: Address;
  userAddress?: Address;
}

export function useBalanceOfSuspense(config: UseBalanceOfSuspenseConfig): UseBalanceOfResult {
  const { address: connectedAddress } = useConnection();
  const { tokenAddress, userAddress = connectedAddress } = config;
  const enabled = !!userAddress;

  const { data, ...query } = useReadContracts({
    contracts: [
      symbolContract(tokenAddress),
      decimalsContract(tokenAddress),
      enabled ? balanceOfContract(tokenAddress, userAddress) : {},
    ],
    query: { suspense: true, enabled: enabled },
  });

  const symbol = data?.[0]?.result as string | undefined;
  const decimals = data?.[1]?.result as number | undefined;
  const value = data?.[2]?.result as bigint | undefined;
  const formatted =
    value !== undefined && decimals !== undefined ? formatUnits(value, decimals) : undefined;

  return {
    data: { value, symbol, decimals, formatted },
    ...query,
  };
}
