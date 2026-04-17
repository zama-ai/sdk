"use client";

import type { Address } from "@zama-fhe/sdk";
import { signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useQuery, useSuspenseQuery } from "./utils/query";
import { useZamaSDK } from "./provider";

/**
 * Read the connected signer address.
 *
 * @example
 * ```tsx
 * const address = useSignerAddress();
 * ```
 */
export function useSignerAddress(): Address | undefined {
  const sdk = useZamaSDK();
  const query = useQuery<Address>(signerAddressQueryOptions(sdk.signer));

  return query.data;
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
