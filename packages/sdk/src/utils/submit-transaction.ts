import type { Hex } from "viem";
import { TransactionRevertedError, ZamaError } from "../errors";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { transactionOperationMetadata, ZamaSDKEvents } from "../events/sdk-events";
import { assertWriteContract } from "../signer/capabilities";
import type {
  GenericProvider,
  GenericSigner,
  TransactionResult,
  WriteContractConfig,
} from "../types";
import { swallow } from "./swallow";

/**
 * Shared write-transaction pipeline for SDK calls that submit a transaction.
 *
 * On success: writes the tx, emits the per-operation submitted event from
 * {@link transactionOperationMetadata}, fires `onSubmitted`, waits for the
 * receipt, and returns `{ txHash, receipt }`.
 *
 * On failure: emits a {@link ZamaSDKEvents.TransactionError} event with the
 * transaction-level error it will throw, then throws it. Existing `ZamaError`
 * instances are rethrown as-is; all other failures are wrapped in
 * `TransactionRevertedError` with the original error as `cause`.
 */
export async function submitTransaction(params: {
  operation: TransactionOperation;
  signer: GenericSigner;
  provider: GenericProvider;
  config: WriteContractConfig;
  emit: (input: ZamaSDKEventInput) => void;
  onSubmitted?: (txHash: Hex) => void;
}): Promise<TransactionResult> {
  const { operation, signer, provider, config, emit, onSubmitted } = params;
  const metadata = transactionOperationMetadata[operation];
  assertWriteContract(signer, operation);

  try {
    const txHash = await signer.writeContract(config);
    emit(metadata.submittedEvent(txHash));
    void swallow(`${operation}: onSubmitted`, () => onSubmitted?.(txHash));
    const receipt = await provider.waitForTransactionReceipt(txHash);
    return { txHash, receipt };
  } catch (error) {
    const failure =
      error instanceof ZamaError
        ? error
        : new TransactionRevertedError(`Transaction failed during ${operation}`, {
            cause: error,
          });

    emit({
      type: ZamaSDKEvents.TransactionError,
      operation,
      error: failure,
    });
    throw failure;
  }
}
