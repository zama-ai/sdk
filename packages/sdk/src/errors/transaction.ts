import { ZamaError, ZamaErrorCode } from "./base";

/** ERC-20 approval transaction failed. */
export class ApprovalFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.ApprovalFailed, message, options);
    this.name = "ApprovalFailedError";
  }
}

/** On-chain transaction reverted. */
export class TransactionRevertedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}
