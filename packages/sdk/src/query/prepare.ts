import type { Hex } from "viem";
import type {
  PreparedFor,
  PreparedTransaction,
  TransactionKind,
  PrepareTransactionRequest,
} from "../types/offline-signing";
import type { OfflineSigningOptions } from "../services/offline-signing-service";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link prepareMutationOptions}. */
export interface PrepareParams {
  readonly request: PrepareTransactionRequest;
  readonly options?: OfflineSigningOptions;
}

/** The prepared unsigned-transaction shape returned by `sdk.offlineSigning.prepare`. */
export type PrepareResult = PreparedFor<TransactionKind>;

/**
 * Mutation options for `sdk.offlineSigning.prepare` — builds an unsigned
 * transaction ({@link TransactionKind}) for the given request.
 */
export function prepareMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.prepare"], PrepareParams, PrepareResult> {
  return {
    mutationKey: ["zama.prepare"] as const,
    // Cast to `never`: the wide request union doesn't match the narrow
    // per-kind overload signature exactly.
    mutationFn: ({ request, options }) => sdk.offlineSigning.prepare(request as never, options),
  };
}

/** Variables for {@link signMutationOptions}. */
export interface SignParams {
  readonly preparedTx: PreparedTransaction;
}

/** Mutation options for `sdk.offlineSigning.sign` — signs prepared bytes, returns hex. */
export function signMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.sign"], SignParams, Hex> {
  return {
    mutationKey: ["zama.sign"] as const,
    mutationFn: ({ preparedTx }) => sdk.offlineSigning.sign(preparedTx),
  };
}
