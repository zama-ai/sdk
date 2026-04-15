import type { ReadonlyToken } from "../token/readonly-token";
import { DecryptionFailedError, isSessionError } from "../errors";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import { toError } from "../utils";
import { pLimit } from "../utils/concurrency";
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
    queryFn: async (context) => {
      const [, { owner: keyOwner, handles: keyHandles }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialBalancesQueryOptions: owner");
      assertNonNullable(keyHandles, "confidentialBalancesQueryOptions: handles");
      assertNonNullable(tokens[0], "confidentialBalancesQueryOptions: tokens[0]");

      const { sdk } = tokens[0];

      // Pre-authorize the full token set in one wallet signature so the
      // per-handle userDecrypt calls below reuse the cached credentials
      // (otherwise each call would trigger its own single-token allow()
      // and the user would see N signature prompts).
      await sdk.allow(tokens.map((t) => t.address));

      const perTokenBalances = new Map<Address, bigint>();
      const perTokenErrors = new Map<Address, Error>();

      await pLimit(
        tokens.map((token, i) => async () => {
          const handle = keyHandles[i]!;
          try {
            const decrypted = await sdk.userDecrypt([{ handle, contractAddress: token.address }]);
            const value = decrypted[handle];
            if (value === undefined) {
              throw new DecryptionFailedError(
                `Decryption returned no value for handle ${handle} on token ${token.address}`,
              );
            }
            assertBigint(value, "confidentialBalancesQueryOptions: result[handle]");
            perTokenBalances.set(token.address, value);
          } catch (error) {
            // Session-level failures (user rejected signature, SDK misconfigured)
            // are not per-token failures — rethrow so the whole query errors out.
            if (isSessionError(error)) {
              throw error;
            }
            perTokenErrors.set(token.address, toError(error));
          }
        }),
        config?.maxConcurrency,
      );

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
          const balance = perTokenBalances.get(tokenAddr);
          if (balance !== undefined) {
            balances.set(originalAddr, balance);
          }
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
