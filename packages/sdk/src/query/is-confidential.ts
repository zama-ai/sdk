import {
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
  supportsInterfaceContract,
  ERC7984_WRAPPER_INTERFACE_ID,
} from "../contracts";
import type { ZamaSDK } from "../zama-sdk";
import { isContractCallError } from "../utils";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

export interface IsConfidentialQueryConfig {
  query?: Record<string, unknown>;
}

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
        // During the transition period, check both wrapper interface IDs in parallel.
        // Either returning true is sufficient to identify a confidential wrapper.
        const [legacyMatch, newMatch] = await Promise.all([
          sdk.provider.readContract(isConfidentialWrapperContract(keyTokenAddress)),
          sdk.provider.readContract(
            supportsInterfaceContract(keyTokenAddress, ERC7984_WRAPPER_INTERFACE_ID),
          ),
        ]);
        return legacyMatch || newMatch;
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
