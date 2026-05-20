import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { TransactionResult } from "../types";
import type { TransactionPrepareRequest } from "../types/offline";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link signAndBroadcastMutationOptions}. */
export interface SignAndBroadcastParams {
  readonly request: TransactionPrepareRequest;
  readonly options?: OfflineSigningOptions;
}

/**
 * Mutation options for `sdk.offlineSigning.signAndBroadcast` — bundled in-process
 * prepare + sign + broadcast for a transaction request.
 */
export function signAndBroadcastMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.signAndBroadcast"],
  SignAndBroadcastParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.signAndBroadcast"] as const,
    mutationFn: ({ request, options }) => sdk.offlineSigning.signAndBroadcast(request, options),
  };
}
