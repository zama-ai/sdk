import type { Hex } from "viem";
import { TransactionRevertedError, ZamaError } from "../errors";
import { matchHcuRevert } from "../errors/hcu-revert";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { transactionOperationMetadata, ZamaSDKEvents } from "../events/sdk-events";
import type {
  GenericLogger,
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
 * {@link transactionOperationMetadata}, fires `onSubmitted`, awaits
 * `beforeReceipt`, waits for the receipt, and returns `{ txHash, receipt }`.
 *
 * On failure, including a mined receipt that reports a revert: emits a
 * {@link ZamaSDKEvents.TransactionError} event with the transaction-level error
 * it will throw, then throws it. Existing `ZamaError` instances are rethrown
 * as-is, a revert from the protocol's HCU limits becomes its typed error, and
 * all other failures are wrapped in `TransactionRevertedError` with the
 * original error as `cause`.
 */
export async function submitTransaction(params: {
  operation: TransactionOperation;
  signer: GenericSigner;
  provider: GenericProvider;
  config: WriteContractConfig;
  emit: (input: ZamaSDKEventInput) => void;
  /** Not awaited. Use `beforeReceipt` for work that must finish before the receipt wait. */
  onSubmitted?: (txHash: Hex) => void;
  /** Awaited before the receipt wait; errors are logged, not thrown. */
  beforeReceipt?: (txHash: Hex) => Promise<void>;
  logger: GenericLogger;
}): Promise<TransactionResult> {
  const { operation, signer, provider, config, emit, onSubmitted, beforeReceipt, logger } = params;
  const metadata = transactionOperationMetadata[operation];

  try {
    const txHash = await signer.writeContract(config);
    emit(metadata.submittedEvent(txHash));
    void swallow(`${operation}: onSubmitted`, () => onSubmitted?.(txHash), logger);
    await swallow(`${operation}: beforeReceipt`, () => beforeReceipt?.(txHash), logger);
    const receipt = await provider.waitForTransactionReceipt(txHash);
    if (receipt.status === "reverted") {
      throw new TransactionRevertedError(`Transaction ${txHash} reverted during ${operation}`);
    }
    return { txHash, receipt };
  } catch (error) {
    const failure =
      error instanceof ZamaError
        ? error
        : (matchHcuRevert(error, operation) ??
          new TransactionRevertedError(`Transaction failed during ${operation}`, { cause: error }));

    emit({ type: ZamaSDKEvents.TransactionError, operation, error: failure });
    throw failure;
  }
}
