"use client";

import { useMemo, useRef } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Address } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";
import { confidentialBalancesQueryKeys, confidentialHandlesQueryKeys } from "./balance-query-keys";

/** Configuration for {@link useConfidentialBalances}. */
export interface UseConfidentialBalancesConfig {
  /** Addresses of the confidential token contracts to batch-query. */
  tokenAddresses: Address[];
  /** Polling interval (ms) for the encrypted handles. Default: 10 000. */
  handleRefetchInterval?: number;
  /** Maximum number of concurrent decrypt calls. Default: `Infinity` (no limit). */
  maxConcurrency?: number;
}

/** Result type for the decrypt phase of {@link useConfidentialBalances}. */
export interface ConfidentialBalancesData {
  /** Successfully decrypted balances (address → balance). */
  balances: Map<Address, bigint>;
  /** Per-token errors for tokens that failed to decrypt. */
  errors: Map<Address, Error>;
  /** `true` if some but not all tokens failed. */
  isPartialError: boolean;
}

/** Query options for the decrypt phase of {@link useConfidentialBalances}. */
export type UseConfidentialBalancesOptions = Omit<
  UseQueryOptions<ConfidentialBalancesData, Error>,
  "queryKey" | "queryFn"
>;

const DEFAULT_HANDLE_REFETCH_INTERVAL = 10_000;

/**
 * Declarative hook to read multiple confidential token balances in batch.
 * Uses two-phase polling: cheaply polls encrypted handles, then only
 * decrypts when any handle changes.
 *
 * Returns partial results when some tokens fail — successful balances are
 * always returned alongside per-token error information.
 *
 * @param config - Token addresses and optional polling interval.
 * @param options - React Query options forwarded to the decrypt query.
 * @returns The decrypt query result plus `handlesQuery` for Phase 1 state.
 *
 * @example
 * ```tsx
 * const { data } = useConfidentialBalances({
 *   tokenAddresses: ["0xTokenA", "0xTokenB"],
 * });
 * const balance = data?.balances.get("0xTokenA");
 * if (data?.isPartialError) {
 *   // some tokens failed — check data.errors
 * }
 * ```
 */
export function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
) {
  const { tokenAddresses, handleRefetchInterval, maxConcurrency } = config;
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address, Error>({
    queryKey: ["zama", "signer-address"],
    queryFn: () => sdk.signer.getAddress(),
  });

  const signerAddress = addressQuery.data;
  const ownerKey = signerAddress ?? "";

  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, tokenAddresses],
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const handlesQuery = useQuery<Address[], Error>({
    queryKey: confidentialHandlesQueryKeys.tokens(tokenAddresses, ownerKey),
    queryFn: () => Promise.all(tokens.map((t) => t.confidentialBalanceOf())),
    enabled: tokenAddresses.length > 0 && !!signerAddress,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handles = handlesQuery.data;
  const handlesKey = handles?.join(",") ?? "";

  // Collect per-token errors during batch decryption via a ref
  // so the callback closure doesn't trigger re-renders.
  const errorsRef = useRef(new Map<Address, Error>());

  // Phase 2: Batch decrypt only when any handle changes
  const balancesQuery = useQuery<ConfidentialBalancesData, Error>({
    queryKey: [...confidentialBalancesQueryKeys.tokens(tokenAddresses, ownerKey), handlesKey],
    queryFn: async () => {
      const perTokenErrors = new Map<Address, Error>();
      errorsRef.current = perTokenErrors;

      const raw = await ReadonlyToken.batchDecryptBalances(tokens, {
        handles: handles!,
        maxConcurrency,
        onError: (error, address) => {
          perTokenErrors.set(address, error);
          return 0n; // fallback so the batch continues
        },
      });

      // Re-key the Map with the caller's original addresses so lookups
      // work regardless of address casing (tokens normalize to lowercase).
      const balances = new Map<Address, bigint>();
      const errors = new Map<Address, Error>();
      for (let i = 0; i < tokens.length; i++) {
        const tokenAddr = tokens[i]!.address;
        const originalAddr = tokenAddresses[i]!;
        const tokenError = perTokenErrors.get(tokenAddr);
        if (tokenError) {
          errors.set(originalAddr, tokenError);
        } else {
          const balance = raw.get(tokenAddr);
          if (balance !== undefined) balances.set(originalAddr, balance);
        }
      }

      // If ALL tokens failed, throw so isError is true
      if (errors.size === tokens.length && tokens.length > 0) {
        throw errors.values().next().value;
      }

      return {
        balances,
        errors,
        isPartialError: errors.size > 0,
      };
    },
    enabled: tokenAddresses.length > 0 && !!signerAddress && !!handles,
    staleTime: Infinity,
    ...options,
  });

  return { ...balancesQuery, handlesQuery };
}
