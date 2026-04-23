import type { Address } from "../utils/address";
import { decimalsContract, nameContract, symbolContract } from "../contracts";

import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

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
  signer: GenericSigner,
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
        signer.readContract(nameContract(keyTokenAddress)),
        signer.readContract(symbolContract(keyTokenAddress)),
        signer.readContract(decimalsContract(keyTokenAddress)),
      ]);
      return { name, symbol, decimals };
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
