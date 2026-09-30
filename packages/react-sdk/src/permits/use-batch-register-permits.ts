"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { SignedPreparedPermit } from "@zama-fhe/sdk";
import { batchRegisterPermitsMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * {@link useRegisterPermit} for every {@link useBatchPreparePermits} payload.
 * Registers in order; permits registered before a failing one stay persisted.
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
    onSettled: (data, error, variables, onMutateResult, context) => {
      options?.onSettled?.(data, error, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
    },
  });
}
