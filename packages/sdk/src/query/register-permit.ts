import type { Hex } from "viem";
import type {
  DecryptionPermitResult,
  PermitKind,
  PreparedPermitFor,
} from "../types/offline-signing";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link registerPermitMutationOptions}. */
export interface RegisterPermitParams {
  readonly preparedPermit: PreparedPermitFor<PermitKind>;
  readonly signature: Hex;
}

/**
 * Mutation options for `sdk.offlineSigning.registerPermit` — persists an externally-signed
 * typed-data envelope in the credential cache. Permit-kind only.
 */
export function registerPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.registerPermit"],
  RegisterPermitParams,
  DecryptionPermitResult
> {
  return {
    mutationKey: ["zama.registerPermit"] as const,
    mutationFn: ({ preparedPermit, signature }) =>
      sdk.offlineSigning.registerPermit(preparedPermit, signature),
  };
}
