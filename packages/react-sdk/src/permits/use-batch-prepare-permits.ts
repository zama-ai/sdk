"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { PreparedPermit, PreparePermitRequest } from "@zama-fhe/sdk";
import { batchPreparePermitsMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * {@link usePreparePermit} for any number of contracts: `data` holds one
 * permit per 10 contracts (the protocol's per-permit cap), each needing its
 * own signature. Pass the signed pairs to {@link useBatchRegisterPermits}.
 *
 * @example
 * ```tsx
 * const { mutateAsync: batchPreparePermits } = useBatchPreparePermits();
 * const prepared = await batchPreparePermits({ signer: custodyAddress, contracts: tokenAddresses });
 * // hand each prepared[i].eip712 to the custodian for eth_signTypedData_v4
 * ```
 */
export function useBatchPreparePermits(
  options?: UseMutationOptions<PreparedPermit[], Error, PreparePermitRequest>,
) {
  const sdk = useZamaSDK();

  return useMutation<PreparedPermit[], Error, PreparePermitRequest>({
    ...batchPreparePermitsMutationOptions(sdk),
    ...options,
  });
}
