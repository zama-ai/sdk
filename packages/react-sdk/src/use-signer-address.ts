"use client";

import type { Address } from "@zama-fhe/sdk";
import { SignerRequiredError } from "@zama-fhe/sdk";
import { useSuspenseQuery } from "./utils/query";
import { useZamaSDK } from "./provider";

export { useSignerAddress } from "./provider";

/**
 * Suspense variant of `useSignerAddress`.
 * Suspends rendering until the signer address resolves.
 * Throws `SignerRequiredError` via the suspense error channel when no signer
 * is configured — consumers should wrap in an error boundary.
 *
 * @example
 * ```tsx
 * const { data: address } = useSignerAddressSuspense();
 * ```
 */
export function useSignerAddressSuspense(): { data: Address } {
  const sdk = useZamaSDK();

  return useSuspenseQuery<Address>({
    queryKey: ["zama.signerAddress"],
    queryFn: async () => {
      if (!sdk.signer) throw new SignerRequiredError("signerAddress");
      return sdk.signer.getAddress();
    },
    staleTime: 30_000,
  });
}
