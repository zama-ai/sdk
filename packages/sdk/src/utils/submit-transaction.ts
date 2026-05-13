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

export async function submitTransaction(params: {
  operation: TransactionOperation;
  signer: GenericSigner;
  provider: GenericProvider;
  config: WriteContractConfig;
  emit: (input: ZamaSDKEventInput) => void;
  onSubmitted?: (txHash: Hex) => void;
  errorClass?: ZamaErrorClass;
  mapError?: (error: unknown) => ZamaError | null | undefined;
  failureMessage?: string;
}): Promise<TransactionResult> {
  const {
    operation,
    signer,
    provider,
    config,
    emit,
    onSubmitted,
    errorClass,
    mapError,
    failureMessage,
  } = params;
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
    throw new ErrorCtor(failureMessage ?? `Transaction failed during ${operation}`, {
      cause: error,
    });
  }
}
