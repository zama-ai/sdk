import { ReadonlyToken } from "../token/readonly-token";
import { DecryptionFailedError } from "../token/errors";

import type { EncryptedBalanceHandle } from "./confidential-balance";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

/** Result type for batch confidential balance queries with partial error support. */
export interface ConfidentialBalancesData {
  /** Successfully decrypted balances (address to balance). */
  balances: Map<Address, bigint>;
  /** Per-token errors for tokens that failed to decrypt. */
  errors: Map<Address, Error>;
  /** `true` if some but not all tokens failed. */
  isPartialError: boolean;
}

export interface ConfidentialBalancesQueryConfig {
  owner?: Address;
  handles?: EncryptedBalanceHandle[];
  maxConcurrency?: number;
  resultAddresses?: Address[];
  query?: Record<string, unknown>;
}

export function confidentialBalancesQueryOptions(
  tokens: ReadonlyToken[],
  config?: ConfidentialBalancesQueryConfig,
): QueryFactoryOptions<
  ConfidentialBalancesData,
  Error,
  ConfidentialBalancesData,
  ReturnType<typeof zamaQueryKeys.confidentialBalances.tokens>
> {
  const tokenAddresses = tokens.map((token) => token.address);
  const resultAddresses = config?.resultAddresses ?? tokenAddresses;
  const ownerKey = config?.owner;
  const handleKeys = config?.handles;
  const queryEnabled = config?.query?.enabled !== false;
  const handlesReady =
    Array.isArray(handleKeys) &&
    handleKeys.length === tokens.length &&
    handleKeys.every((handle) => Boolean(handle));
  const queryKey = zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, ownerKey, handleKeys);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { owner: keyOwner, handles: keyHandles }] = context.queryKey;
      if (!keyOwner) throw new Error("owner is required");
      if (!keyHandles) throw new Error("handles are required");
      const perTokenErrors = new Map<Address, Error>();

      const raw = await ReadonlyToken.batchDecryptBalances(tokens, {
        owner: keyOwner,
        handles: keyHandles,
        maxConcurrency: config?.maxConcurrency,
        onError: (error, address) => {
          perTokenErrors.set(address, error);
          return 0n;
        },
      });

      // Re-key with caller's original addresses (tokens normalize to lowercase)
      const balances = new Map<Address, bigint>();
      const errors = new Map<Address, Error>();
      for (let i = 0; i < tokens.length; i++) {
        const tokenAddr = tokens[i]!.address;
        const originalAddr = resultAddresses[i]!;
        const tokenError = perTokenErrors.get(tokenAddr);
        if (tokenError) {
          errors.set(originalAddr, tokenError);
        } else {
          const balance = raw.get(tokenAddr);
          if (balance !== undefined) balances.set(originalAddr, balance);
        }
      }

      // Total failure: throw so TanStack Query sets isError = true
      if (errors.size === tokens.length && tokens.length > 0) {
        const firstError = errors.values().next().value;
        throw firstError ?? new DecryptionFailedError("All token balance decryptions failed");
      }

      return { balances, errors, isPartialError: errors.size > 0 };
    },
    enabled:
      resultAddresses.length === tokens.length &&
      Boolean(ownerKey) &&
      tokens.length > 0 &&
      handlesReady &&
      queryEnabled,
    staleTime: Infinity,
  };
}
