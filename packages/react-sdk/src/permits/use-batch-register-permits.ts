"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { SignedPreparedPermit } from "@zama-fhe/sdk";
import { batchRegisterPermitsMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * {@link useRegisterPermit} for every {@link useBatchPreparePermits} payload.
 * Every permit is verified before any is stored, so a permit that fails
 * verification leaves the store untouched. Storing stays best-effort, like
 * `useRegisterPermit`: a failed store write is logged, not thrown.
 *
 * @example
 * ```tsx
 * const { mutateAsync: batchRegisterPermits } = useBatchRegisterPermits();
 * await batchRegisterPermits(
 *   await Promise.all(
 *     prepared.map(async (p) => ({ prepared: p, signature: await custodian.signTypedData(p.eip712) })),
 *   ),
 * );
 * ```
 */
export function useBatchRegisterPermits(
  options?: UseMutationOptions<void, Error, readonly SignedPreparedPermit[]>,
) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, readonly SignedPreparedPermit[]>({
    ...batchRegisterPermitsMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
    },
  });
}
