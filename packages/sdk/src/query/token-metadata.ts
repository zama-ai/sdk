import { decimalsContract, nameContract, symbolContract } from "../contracts";
import type { Address } from "../token/token.types";
import type { GenericSigner } from "../token/token.types";
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
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.tokenMetadata.token>, TokenMetadata> {
  const queryKey = zamaQueryKeys.tokenMetadata.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      const [name, symbol, decimals] = await Promise.all([
        signer.readContract(nameContract(keyTokenAddress as Address)),
        signer.readContract(symbolContract(keyTokenAddress as Address)),
        signer.readContract(decimalsContract(keyTokenAddress as Address)),
      ]);
      return { name: name as string, symbol: symbol as string, decimals: decimals as number };
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
