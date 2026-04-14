import {
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
  supportsInterfaceContract,
  ERC7984_WRAPPER_INTERFACE_ID_NEW,
} from "../contracts";
import type { GenericSigner } from "../types";
import { isContractCallError } from "../utils";
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
      try {
        return await signer.readContract(isConfidentialTokenContract(keyTokenAddress));
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
      try {
        // During the transition period, check both the legacy (0xd04584ba) and new
        // (0x1f1c62b2) wrapper interface IDs in parallel. Either returning true is
        // sufficient to identify a confidential wrapper.
        const [legacyMatch, newMatch] = await Promise.all([
          signer.readContract(isConfidentialWrapperContract(keyTokenAddress)),
          signer.readContract(supportsInterfaceContract(keyTokenAddress, ERC7984_WRAPPER_INTERFACE_ID_NEW)),
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
