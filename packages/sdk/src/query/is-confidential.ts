import { isConfidentialTokenContract, isConfidentialWrapperContract } from "../contracts";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

export interface IsConfidentialQueryConfig {
  query?: Record<string, unknown>;
}

export function isConfidentialQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: IsConfidentialQueryConfig,
): QueryFactoryOptions<
  boolean,
  Error,
  boolean,
  ReturnType<typeof zamaQueryKeys.isConfidential.token>
> {
  const queryKey = zamaQueryKeys.isConfidential.token(tokenAddress);
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract(isConfidentialTokenContract(keyTokenAddress));
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}

export function isWrapperQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: IsConfidentialQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isWrapper.token>> {
  const queryKey = zamaQueryKeys.isWrapper.token(tokenAddress);
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract(isConfidentialWrapperContract(keyTokenAddress));
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
