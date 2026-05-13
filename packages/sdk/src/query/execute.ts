import type {
  CredentialPermitRequest,
  CredentialPermitResult,
  TransactionPrepareRequest,
} from "../types/prepared-tx";
import type { TransactionResult } from "../types";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link executeMutationOptions}. */
export interface ExecuteParams {
  readonly request: TransactionPrepareRequest | CredentialPermitRequest;
  readonly options?: OfflineSigningOptions;
}

/** Discriminated result returned by `sdk.offline.execute`. */
export type ExecuteResult = TransactionResult | CredentialPermitResult | void;

/**
 * Mutation options for `sdk.offline.execute` — bundled in-process prepare + sign +
 * broadcast (transaction kind) or prepare + signTypedData + registerPermit
 * (`CredentialPermit`).
 */
export function executeMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.execute"], ExecuteParams, ExecuteResult> {
  return {
    mutationKey: ["zama.execute"] as const,
    mutationFn: ({ request, options }) => sdk.offline.execute(request as never, options),
  };
}
