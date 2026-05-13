import type { Hex } from "viem";
import { TransactionRevertedError, ZamaError } from "../errors";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { transactionOperationMetadata, ZamaSDKEvents } from "../events/sdk-events";
import type {
  GenericProvider,
  GenericSigner,
  TransactionResult,
  WriteContractConfig,
} from "../types";
import { toError } from "./error";
import { swallow } from "./swallow";

/** Constructor of a {@link ZamaError} subclass with the standard message/options signature. */
export type ZamaErrorClass = new (message: string, options?: ErrorOptions) => ZamaError;

/**
 * Shared write-transaction pipeline used by every SDK call that submits a tx.
 *
 * On success: writes the tx, emits the per-operation submitted event from
 * {@link transactionOperationMetadata}, fires `onSubmitted`, waits for the
 * receipt, and returns `{ txHash, receipt }`.
 *
 * On failure: always emits a {@link ZamaSDKEvents.TransactionError} event
 * (including for `ZamaError` causes), then throws according to this precedence:
 *
 * 1. `ZamaError` instances are rethrown as-is.
 * 2. `mapError(error)` is consulted next; if it returns a `ZamaError`, that
 *    is thrown (used for revert-data → typed-error mapping).
 * 3. Otherwise wraps in `errorClass ?? TransactionRevertedError` with a
 *    generic `"Transaction failed during ${operation}"` message and the
 *    original error as `cause`.
 */
export async function submitTransaction(params: {
  operation: TransactionOperation;
  signer: GenericSigner;
  provider: GenericProvider;
  config: WriteContractConfig;
  emit: (input: ZamaSDKEventInput) => void;
  onSubmitted?: (txHash: Hex) => void;
  errorClass?: ZamaErrorClass;
  mapError?: (error: unknown) => ZamaError | null | undefined;
}): Promise<TransactionResult> {
  const { operation, signer, provider, config, emit, onSubmitted, errorClass, mapError } = params;
  const metadata = transactionOperationMetadata[operation];

  try {
    const txHash = await signer.writeContract(config);
    emit(metadata.submittedEvent(txHash));
    void swallow(`${operation}: onSubmitted`, () => onSubmitted?.(txHash));
    const receipt = await provider.waitForTransactionReceipt(txHash);
    return { txHash, receipt };
  } catch (error) {
    emit({
      type: ZamaSDKEvents.TransactionError,
      operation,
      error: toError(error),
    });
    if (error instanceof ZamaError) {
      throw error;
    }
    const mapped = mapError?.(error);
    if (mapped) {
      throw mapped;
    }
    const ErrorCtor = errorClass ?? TransactionRevertedError;
    throw new ErrorCtor(`Transaction failed during ${operation}`, {
      cause: error,
    });
  }
}
