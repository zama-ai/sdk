"use client";

import { useMemo } from "react";
import type { Address, Token } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/** Base configuration shared by all mutation hooks that need a Token instance. */
export interface UseZamaConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Address of the wrapper contract (required for shield/unshield operations). */
  wrapperAddress?: Address;
}

/**
 * Get a {@link Token} instance, memoized by address pair. Returns `undefined`
 * when the SDK has no signer configured (read-only mode) — mutation hooks
 * handle this by throwing {@link SignerRequiredError} at mutate time.
 *
 * Reads signer and storage from the nearest {@link ZamaProvider}.
 *
 * @param config - Token and optional wrapper addresses.
 * @returns A memoized `Token` instance, or `undefined` when no signer.
 *
 * @example
 * ```tsx
 * const token = useToken({ tokenAddress: "0xToken", wrapperAddress: "0xWrapper" });
 * ```
 */
export function useToken(config: UseZamaConfig): Token | undefined {
  const sdk = useZamaSDK();

  return useMemo(
    () => (sdk.signer ? sdk.createToken(config.tokenAddress, config.wrapperAddress) : undefined),
    [sdk, sdk.signer, config.tokenAddress, config.wrapperAddress],
  );
}
