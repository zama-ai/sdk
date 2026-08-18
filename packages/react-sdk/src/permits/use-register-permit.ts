"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import {
  registerPermitMutationOptions,
  zamaQueryKeys,
  type RegisterPermitParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Verify and persist the signature an out-of-process signer produced for a
 * {@link usePreparePermit} payload — the second phase of the offline permit
 * flow. No wallet account required: the permit is scoped by
 * `prepared.signerAddress`, not a connected signer.
 *
 * @example
 * ```tsx
 * const { mutateAsync: registerPermit } = useRegisterPermit();
 * await registerPermit({ prepared, signature });
 * ```
 */
export function useRegisterPermit(options?: UseMutationOptions<void, Error, RegisterPermitParams>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, RegisterPermitParams>({
    ...registerPermitMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
    },
  });
}
