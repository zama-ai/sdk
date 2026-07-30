import { isConfidentialTokenContract, isConfidentialWrapperContract } from "../contracts";
import type { ZamaSDK } from "../zama-sdk";
import { isContractCallError } from "../utils";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

/** Configuration for {@link isConfidentialQueryOptions} and {@link isWrapperQueryOptions}. */
export interface IsConfidentialQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Builds TanStack Query options for reading whether a token address implements the confidential (ERC-7984) token interface. */
export function isConfidentialQueryOptions(
  sdk: ZamaSDK,
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
      try {
        return await sdk.provider.readContract(isConfidentialTokenContract(keyTokenAddress));
      } catch (err) {
        // Only suppress contract execution reverts (non-ERC-165 contracts).
        // Re-throw network/transport errors so TanStack Query's retry logic applies.
        if (isContractCallError(err)) {
          return false;
        }
        throw err;
      }
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}

/** Builds TanStack Query options for reading whether a token address is a confidential wrapper (ERC-7984 wrapper) contract. */
export function isWrapperQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address,
  config?: IsConfidentialQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isWrapper.token>> {
  const queryKey = zamaQueryKeys.isWrapper.token(tokenAddress);
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      try {
        return await sdk.provider.readContract(isConfidentialWrapperContract(keyTokenAddress));
      } catch (err) {
        // Only suppress contract execution reverts (non-ERC-165 contracts).
        // Re-throw network/transport errors so TanStack Query's retry logic applies.
        if (isContractCallError(err)) {
          return false;
        }
        throw err;
      }
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
