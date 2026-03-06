import { isConfidentialTokenContract, isConfidentialWrapperContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface IsConfidentialQueryConfig {
  query?: Record<string, unknown>;
}

export function isConfidentialQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: IsConfidentialQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.isConfidential.token>, boolean> {
  const queryKey = zamaQueryKeys.isConfidential.token(tokenAddress);
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract(isConfidentialTokenContract(keyTokenAddress as Address));
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}

export function isWrapperQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: IsConfidentialQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.isWrapper.token>, boolean> {
  const queryKey = zamaQueryKeys.isWrapper.token(tokenAddress);
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract(isConfidentialWrapperContract(keyTokenAddress as Address));
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
