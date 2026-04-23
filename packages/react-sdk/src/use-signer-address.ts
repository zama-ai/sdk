"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useQuery, useSuspenseQuery } from "./utils/query";
import { useZamaSDK } from "./provider";

/**
 * Read the connected signer address.
 *
 * @example
 * ```tsx
 * const { data: address, isPending, isError } = useSignerAddress();
 * ```
 */
export function useSignerAddress(): UseQueryResult<Address> {
  const sdk = useZamaSDK();
  return useQuery<Address>(signerAddressQueryOptions(sdk.signer));
}

/**
 * Suspense variant of `useSignerAddress`.
 * Suspends rendering until the signer address resolves.
 *
 * @example
 * ```tsx
 * const { data: address } = useSignerAddressSuspense();
 * ```
 */
export function useSignerAddressSuspense(): { data: Address } {
  const sdk = useZamaSDK();

  return useSuspenseQuery<Address>(signerAddressQueryOptions(sdk.signer));
}
