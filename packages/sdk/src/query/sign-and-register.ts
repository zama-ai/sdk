import type { CredentialPermitRequest, CredentialPermitResult } from "../types/offline";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link signAndRegisterMutationOptions}. */
export interface SignAndRegisterParams {
  readonly request: CredentialPermitRequest;
}

/**
 * Mutation options for `sdk.offline.signAndRegister` — bundled in-process
 * prepare + signTypedData + register for a credential permit. Returns the
 * registered permit metadata, or `void` when the permit was already cached
 * and no signature was needed.
 */
export function signAndRegisterMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.signAndRegister"],
  SignAndRegisterParams,
  CredentialPermitResult | void
> {
  return {
    mutationKey: ["zama.signAndRegister"] as const,
    mutationFn: ({ request }) => sdk.offline.signAndRegister(request),
  };
}
