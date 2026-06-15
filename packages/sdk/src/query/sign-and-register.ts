import type { CredentialPermitRequest, CredentialPermitResult } from "../types/offline";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link signAndRegisterMutationOptions}. */
export interface SignAndRegisterParams {
  readonly request: CredentialPermitRequest;
}

/**
 * Mutation options for `sdk.offlineSigning.signAndRegister` — bundled in-process
 * prepare + signTypedData + register for a credential permit. Returns the
 * registered permit metadata. When every requested contract is already
 * cached, the underlying `prepare` short-circuits to the `Covered` variant
 * and its inlined `result` is returned without prompting the signer.
 */
export function signAndRegisterMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.signAndRegister"],
  SignAndRegisterParams,
  CredentialPermitResult
> {
  return {
    mutationKey: ["zama.signAndRegister"] as const,
    mutationFn: ({ request }) => sdk.offlineSigning.signAndRegister(request),
  };
}
