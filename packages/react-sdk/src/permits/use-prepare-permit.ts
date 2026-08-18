"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { PreparedPermit, PreparePermitRequest } from "@zama-fhe/sdk";
import { preparePermitMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Build the unsigned EIP-712 typed data for a decryption permit, without
 * signing it — for custody partners (HSM, policy engines, out-of-process
 * signers) that cannot sign in-process. Hand `data.eip712` to the external
 * signer for `eth_signTypedData_v4`, then pass the returned signature to
 * {@link useRegisterPermit}.
 *
 * Prefer {@link useGrantPermit} unless signing must happen out-of-process:
 * this is the offline, low-level counterpart — one permit per call, no
 * widening or chunking against existing permits.
 *
 * @example
 * ```tsx
 * const { mutateAsync: preparePermit } = usePreparePermit();
 * const prepared = await preparePermit({ signer: custodyAddress, contracts: [tokenAddress] });
 * // hand prepared.eip712 to the custodian for eth_signTypedData_v4
 * ```
 */
export function usePreparePermit(
  options?: UseMutationOptions<PreparedPermit, Error, PreparePermitRequest>,
) {
  const sdk = useZamaSDK();

  return useMutation<PreparedPermit, Error, PreparePermitRequest>({
    ...preparePermitMutationOptions(sdk),
    ...options,
  });
}
