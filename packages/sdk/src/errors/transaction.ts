import { ZamaError, ZamaErrorCode } from "./base";

/** On-chain transaction reverted. */
export class TransactionRevertedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}

/**
 * The transaction needs more FHE compute (HCU) than the current block has
 * left. The budget resets every block, so a retry in the next block can succeed.
 */
export class HcuBlockLimitExceededError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.HcuBlockLimitExceeded, message, options);
    this.name = "HcuBlockLimitExceededError";
  }
}

/**
 * The transaction needs more FHE compute (HCU) than one transaction may use,
 * in total or along one sequential chain of operations. Retrying does not
 * help: the transaction has to do less FHE work.
 */
export class HcuTransactionLimitExceededError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.HcuTransactionLimitExceeded, message, options);
    this.name = "HcuTransactionLimitExceededError";
  }
}
