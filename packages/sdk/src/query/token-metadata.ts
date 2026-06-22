import { decimalsContract, nameContract, symbolContract } from "../contracts";

import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

/** ERC-20 token metadata returned by {@link tokenMetadataQueryOptions}. */
export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export interface TokenMetadataQueryConfig {
  query?: Record<string, unknown>;
}

export function tokenMetadataQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address,
  config?: TokenMetadataQueryConfig,
): QueryFactoryOptions<
  TokenMetadata,
  Error,
  TokenMetadata,
  ReturnType<typeof zamaQueryKeys.tokenMetadata.token>
> {
  const queryKey = zamaQueryKeys.tokenMetadata.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      const [name, symbol, decimals] = await Promise.all([
        sdk.provider.readContract(nameContract(keyTokenAddress)),
        sdk.provider.readContract(symbolContract(keyTokenAddress)),
        sdk.provider.readContract(decimalsContract(keyTokenAddress)),
      ]);
      return { name, symbol, decimals };
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
