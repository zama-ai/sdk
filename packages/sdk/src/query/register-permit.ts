import type { Hex } from "viem";
import type { CredentialPermitResult, PermitKind, PreparedPermitFor } from "../types/prepared-tx";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link registerPermitMutationOptions}. */
export interface RegisterPermitParams {
  readonly prepared: PreparedPermitFor<PermitKind>;
  readonly signature: Hex;
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.registerPermit` — persists an externally-signed
 * typed-data envelope in the credential cache. Permit-kind only.
 */
export function registerPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.registerPermit"],
  RegisterPermitParams,
  CredentialPermitResult
> {
  return {
    mutationKey: ["zama.registerPermit"] as const,
    mutationFn: ({ prepared, signature, options }) =>
      sdk.registerPermit(prepared, signature, options),
  };
}
