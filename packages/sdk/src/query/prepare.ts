import type {
  CredentialPermitRequest,
  PermitKind,
  PreparedFor,
  PreparedPermitFor,
  TransactionKind,
  TransactionPrepareRequest,
} from "../types/prepared-tx";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link prepareMutationOptions}. */
export interface PrepareParams {
  readonly request: TransactionPrepareRequest | CredentialPermitRequest;
  readonly options?: OfflineSigningOptions;
}

/** Discriminated union over the two prepared shapes returned by `sdk.prepare`. */
export type PrepareResult = PreparedFor<TransactionKind> | PreparedPermitFor<PermitKind>;

/**
 * Mutation options for `sdk.prepare`. Generic over `kind` — the same factory
 * builds an unsigned transaction (`TransactionKind`) or a typed-data envelope
 * (`PermitKind`) depending on the request.
 */
export function prepareMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.prepare"], PrepareParams, PrepareResult> {
  return {
    mutationKey: ["zama.prepare"] as const,
    mutationFn: ({ request, options }) =>
      // Delegate to the SDK's overloaded `prepare` — cast to `never` because
      // the wide union doesn't match either narrow overload signature exactly.
      sdk.prepare(request as never, options),
  };
}
