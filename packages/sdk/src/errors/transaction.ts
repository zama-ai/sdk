import { ZamaError, ZamaErrorCode } from "./base";

/** On-chain transaction reverted. */
export class TransactionRevertedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}
